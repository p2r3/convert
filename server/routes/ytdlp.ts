import { Router } from "express";
import { ytdlpFetch, ytdlpAvailable } from "../lib/ytdlp.ts";
import { ApiError, badRequest } from "../lib/errors.ts";
import { log } from "../lib/log.ts";
import { resultCache } from "../lib/cache.ts";
import { estimateMs } from "../lib/estimate.ts";
import { INLINE_THRESHOLD_MS, spawnJob, waitForJob, getJobWithBytes } from "../lib/jobs.ts";
import { inc } from "../lib/metrics.ts";
import { contentDispositionHeader } from "./_disposition.ts";

export const ytdlpRouter: Router = Router();

ytdlpRouter.get("/api/ytdlp/status", async (_req, res) => {
  res.json({ available: await ytdlpAvailable() });
});

ytdlpRouter.post("/api/ytdlp", async (req, res, next) => {
  try {
    const body = (req.body || {}) as Record<string, unknown>;
    const query = (req.query || {}) as Record<string, unknown>;
    const src = { ...query, ...body };
    const url = typeof src.url === "string" ? src.url : "";
    if (!url) throw badRequest("Missing required field 'url'");
    const format = typeof src.format === "string" ? src.format : "best";
    const quality = typeof src.quality === "string" ? src.quality : undefined;
    const forceAsync = src.async === true || src.async === "true";
    const forceSync = src.sync === true || src.sync === "true";

    log.info(`POST /api/ytdlp url=${url} format=${format}`);

    const cacheKey = resultCache.key("ytdlp", { url, format, quality });
    if (src.nocache !== "1" && src.nocache !== true) {
      const hit = await resultCache.get(cacheKey);
      if (hit) {
        inc("ytdlp_cache_hits_total", {});
        res.setHeader("content-type", hit.contentType);
        res.setHeader("content-disposition", contentDispositionHeader(hit.fileName));
        res.send(Buffer.from(hit.bytes));
        return;
      }
    }

    const estimate = estimateMs({ kind: "ytdlp" });
    const shouldAsync = !forceSync && (forceAsync || estimate > INLINE_THRESHOLD_MS);

    const worker = async (setProgress: (n: number) => void, signal: AbortSignal) => {
      const result = await ytdlpFetch({
        url,
        format,
        quality,
        signal,
        onProgress: (frac) => setProgress(Math.min(0.95, frac * 0.95)),
      });
      const payload = {
        bytes: result.bytes,
        contentType: result.contentType,
        fileName: result.fileName,
        metadata: result.metadata,
      };
      await resultCache.set(cacheKey, payload);
      return payload;
    };

    if (shouldAsync) {
      const job = spawnJob({
        kind: "ytdlp",
        estimateMs: estimate,
        input: { url, format, quality },
        worker: async ({ setProgress, signal }) => worker(setProgress, signal),
      });
      inc("ytdlp_jobs_total", { mode: "async" });
      const base = `${(req.headers["x-forwarded-proto"] as string) || req.protocol}://${req.headers["x-forwarded-host"] || req.get("host")}`;
      res.status(202).json({
        jobId: job.id,
        kind: "ytdlp",
        status: "queued",
        estimateMs: estimate,
        estimatedSeconds: Math.round(estimate / 100) / 10,
        statusUrl: `${base}/api/jobs/${job.id}`,
        resultUrl: `${base}/api/jobs/${job.id}/result`,
        streamUrl: `${base}/api/jobs/${job.id}/stream`,
      });
      return;
    }

    inc("ytdlp_jobs_total", { mode: "sync" });
    const job = spawnJob({
      kind: "ytdlp",
      estimateMs: estimate,
      input: { url, format, quality },
      worker: async ({ setProgress, signal }) => worker(setProgress, signal),
    });
    const finished = await waitForJob(job.id, Math.max(30_000, estimate * 5));
    if (finished.status === "failed") throw new ApiError(500, finished.error || "yt-dlp failed");
    const internal = getJobWithBytes(job.id);
    if (!internal?.result) throw new ApiError(500, "Result vanished");
    res.setHeader("content-type", internal.result.contentType);
    res.setHeader("content-disposition", contentDispositionHeader(internal.result.fileName));
    res.send(Buffer.from(internal.result.bytes));
  } catch (e) {
    next(e);
  }
});
