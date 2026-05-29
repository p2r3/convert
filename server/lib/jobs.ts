import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { log } from "./log.ts";

export type JobStatus = "queued" | "running" | "complete" | "failed" | "cancelled";

export interface JobResult {
  bytes: Uint8Array;
  contentType: string;
  fileName: string;
  metadata?: Record<string, unknown>;
}

export interface Job {
  id: string;
  kind: string;
  status: JobStatus;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  /** Rough estimate in ms when the job was created. */
  estimateMs: number;
  /** 0-1 progress reported by the worker. */
  progress: number;
  result?: JobResult;
  error?: string;
  /** Optional input echo used by JSON snapshots. */
  input?: Record<string, unknown>;
}

interface InternalJob extends Job {
  cancel: AbortController;
  promise?: Promise<JobResult>;
}

const TTL_MS = Number(process.env.CONVERT_API_JOB_TTL_MS) || 60 * 60 * 1000; // 1h
const MAX_JOBS = Number(process.env.CONVERT_API_MAX_JOBS) || 5000;

/**
 * Threshold below which the route layer is allowed to run a job synchronously
 * and return the result inline rather than yielding a 202 + jobId.
 */
export const INLINE_THRESHOLD_MS = Number(process.env.CONVERT_API_INLINE_THRESHOLD_MS) || 100;

class JobStore extends EventEmitter {
  private jobs = new Map<string, InternalJob>();
  private cleanupTimer: NodeJS.Timeout;

  constructor() {
    super();
    this.cleanupTimer = setInterval(() => this.evict(), 60_000);
    this.cleanupTimer.unref?.();
  }

  create(kind: string, estimateMs: number, input?: Record<string, unknown>): InternalJob {
    if (this.jobs.size >= MAX_JOBS) this.evict(true);
    const id = randomUUID();
    const job: InternalJob = {
      id,
      kind,
      status: "queued",
      createdAt: Date.now(),
      estimateMs: Math.max(0, Math.round(estimateMs)),
      progress: 0,
      cancel: new AbortController(),
      input,
    };
    this.jobs.set(id, job);
    this.emit("create", this.snapshot(job));
    return job;
  }

  get(id: string): InternalJob | undefined {
    return this.jobs.get(id);
  }

  list(filter?: { status?: JobStatus; kind?: string }): Job[] {
    const out: Job[] = [];
    for (const j of this.jobs.values()) {
      if (filter?.status && j.status !== filter.status) continue;
      if (filter?.kind && j.kind !== filter.kind) continue;
      out.push(this.snapshot(j));
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  }

  markRunning(id: string): void {
    const j = this.jobs.get(id);
    if (!j) return;
    j.status = "running";
    j.startedAt = Date.now();
    this.emit("update", this.snapshot(j));
  }

  setProgress(id: string, progress: number): void {
    const j = this.jobs.get(id);
    if (!j) return;
    j.progress = Math.max(0, Math.min(1, progress));
    this.emit("update", this.snapshot(j));
  }

  complete(id: string, result: JobResult): void {
    const j = this.jobs.get(id);
    if (!j) return;
    j.status = "complete";
    j.progress = 1;
    j.result = result;
    j.finishedAt = Date.now();
    this.emit("update", this.snapshot(j));
    this.emit(`done:${id}`, j);
  }

  fail(id: string, error: string): void {
    const j = this.jobs.get(id);
    if (!j) return;
    j.status = "failed";
    j.error = error;
    j.finishedAt = Date.now();
    this.emit("update", this.snapshot(j));
    this.emit(`done:${id}`, j);
  }

  cancel(id: string): boolean {
    const j = this.jobs.get(id);
    if (!j) return false;
    if (j.status === "complete" || j.status === "failed") return false;
    j.cancel.abort();
    j.status = "cancelled";
    j.finishedAt = Date.now();
    this.emit("update", this.snapshot(j));
    this.emit(`done:${id}`, j);
    return true;
  }

  delete(id: string): boolean {
    return this.jobs.delete(id);
  }

  /** JSON-safe snapshot (no bytes, no AbortController). */
  snapshot(j: Job | InternalJob): Job {
    return {
      id: j.id,
      kind: j.kind,
      status: j.status,
      createdAt: j.createdAt,
      startedAt: j.startedAt,
      finishedAt: j.finishedAt,
      estimateMs: j.estimateMs,
      progress: j.progress,
      error: j.error,
      input: j.input,
      result: j.result
        ? {
            bytes: new Uint8Array(0), // strip bytes from snapshot
            contentType: j.result.contentType,
            fileName: j.result.fileName,
            metadata: j.result.metadata,
          }
        : undefined,
    };
  }

  /** Drop jobs older than TTL (or, when `force`, drop oldest 10%). */
  evict(force = false): void {
    const cutoff = Date.now() - TTL_MS;
    let dropped = 0;
    if (force) {
      const arr = Array.from(this.jobs.values()).sort((a, b) => a.createdAt - b.createdAt);
      const n = Math.max(1, Math.floor(arr.length * 0.1));
      for (let i = 0; i < n; i++) {
        this.jobs.delete(arr[i].id);
        dropped++;
      }
    }
    for (const [id, j] of this.jobs) {
      if (j.createdAt < cutoff && j.status !== "running") {
        this.jobs.delete(id);
        dropped++;
      }
    }
    if (dropped > 0) log.info(`Evicted ${dropped} job(s)`);
  }
}

export const jobs = new JobStore();

export interface RunOptions {
  kind: string;
  estimateMs: number;
  input?: Record<string, unknown>;
  worker: (ctx: {
    setProgress: (n: number) => void;
    signal: AbortSignal;
  }) => Promise<JobResult>;
}

/**
 * Run a worker. If the estimate is small, await it inline so we can return the
 * result body in the same response. Otherwise enqueue and return immediately
 * with the job descriptor. Callers decide which mode to use.
 */
export function spawnJob(opts: RunOptions): Job {
  const job = jobs.create(opts.kind, opts.estimateMs, opts.input);
  const setProgress = (n: number) => jobs.setProgress(job.id, n);
  jobs.markRunning(job.id);
  const promise = opts
    .worker({ setProgress, signal: job.cancel.signal })
    .then(
      (result) => {
        jobs.complete(job.id, result);
        return result;
      },
      (e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        jobs.fail(job.id, msg);
        // Swallow the rejection — failure is recorded in the job store. Callers
        // observe outcomes via `waitForJob` / SSE, not via `job.promise` itself,
        // and an unhandled rejection here would crash the process.
        return { bytes: new Uint8Array(0), contentType: "application/octet-stream", fileName: "error" };
      },
    );
  job.promise = promise;
  return job;
}

/** Wait for a job to finish (resolved or failed). Resolves even if cancelled. */
export function waitForJob(id: string, timeoutMs?: number): Promise<Job> {
  return new Promise((resolve, reject) => {
    const j = jobs.get(id);
    if (!j) {
      reject(new Error(`Job ${id} not found`));
      return;
    }
    if (j.status === "complete" || j.status === "failed" || j.status === "cancelled") {
      resolve(jobs.snapshot(j));
      return;
    }
    let timer: NodeJS.Timeout | null = null;
    const onDone = () => {
      if (timer) clearTimeout(timer);
      const cur = jobs.get(id);
      resolve(cur ? jobs.snapshot(cur) : { ...j, status: "failed" as JobStatus, error: "Job vanished" });
    };
    jobs.once(`done:${id}`, onDone);
    if (timeoutMs) {
      timer = setTimeout(() => {
        jobs.off(`done:${id}`, onDone);
        reject(new Error(`Timed out after ${timeoutMs}ms waiting for job ${id}`));
      }, timeoutMs);
    }
  });
}

/**
 * Get the raw (with-bytes) job by id. Internal use; routes use this to stream
 * the result back to the client.
 */
export function getJobWithBytes(id: string): InternalJob | undefined {
  return jobs.get(id);
}
