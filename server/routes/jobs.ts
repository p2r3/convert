import { Router } from "express";
import { jobs, getJobWithBytes, waitForJob } from "../lib/jobs.ts";
import { notFound } from "../lib/errors.ts";
import { contentDispositionHeader } from "./_disposition.ts";

export const jobsRouter: Router = Router();

jobsRouter.get("/api/jobs", (req, res) => {
  const status = (req.query.status as string | undefined) as
    | "queued"
    | "running"
    | "complete"
    | "failed"
    | "cancelled"
    | undefined;
  const kind = req.query.kind as string | undefined;
  res.json({ jobs: jobs.list({ status, kind }) });
});

jobsRouter.get("/api/jobs/:id", (req, res) => {
  const j = jobs.get(req.params.id);
  if (!j) throw notFound(`Job ${req.params.id} not found`);
  res.json(jobs.snapshot(j));
});

jobsRouter.delete("/api/jobs/:id", (req, res) => {
  const cancelled = jobs.cancel(req.params.id);
  if (cancelled) {
    res.json({ ok: true, status: "cancelled" });
    return;
  }
  const deleted = jobs.delete(req.params.id);
  if (!deleted) throw notFound(`Job ${req.params.id} not found`);
  res.json({ ok: true, status: "deleted" });
});

jobsRouter.get("/api/jobs/:id/result", async (req, res, next) => {
  try {
    const id = req.params.id;
    const wait = req.query.wait === "1" || req.query.wait === "true";
    let j = getJobWithBytes(id);
    if (!j) throw notFound(`Job ${id} not found`);
    if (wait && (j.status === "queued" || j.status === "running")) {
      await waitForJob(id, Number(req.query.timeoutMs) || 120_000);
      j = getJobWithBytes(id);
      if (!j) throw notFound(`Job ${id} vanished`);
    }
    if (j.status === "failed") {
      res.status(500).json({ error: j.error || "Job failed" });
      return;
    }
    if (j.status !== "complete") {
      res.status(202).json(jobs.snapshot(j));
      return;
    }
    if (!j.result) {
      res.status(500).json({ error: "Job complete but result missing" });
      return;
    }
    res.setHeader("content-type", j.result.contentType);
    res.setHeader("content-disposition", contentDispositionHeader(j.result.fileName));
    res.send(Buffer.from(j.result.bytes));
  } catch (e) {
    next(e);
  }
});

// Server-Sent Events stream of job progress.
jobsRouter.get("/api/jobs/:id/stream", (req, res) => {
  const id = req.params.id;
  const j = jobs.get(id);
  if (!j) {
    res.status(404).json({ error: `Job ${id} not found` });
    return;
  }
  res.setHeader("content-type", "text/event-stream");
  res.setHeader("cache-control", "no-cache");
  res.setHeader("connection", "keep-alive");
  res.flushHeaders?.();
  const send = (ev: string, data: unknown) => {
    res.write(`event: ${ev}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  send("snapshot", jobs.snapshot(j));
  const onUpdate = (snap: unknown) => {
    const s = snap as { id: string };
    if (s.id === id) send("update", snap);
  };
  const onDone = () => {
    const cur = jobs.get(id);
    if (cur) send("done", jobs.snapshot(cur));
    cleanup();
    res.end();
  };
  function cleanup() {
    jobs.off("update", onUpdate);
    jobs.off(`done:${id}`, onDone);
  }
  jobs.on("update", onUpdate);
  jobs.once(`done:${id}`, onDone);
  req.on("close", () => {
    cleanup();
  });
});
