import { Router, type Request, type Response } from "express";
import { captureUrl, type ScreenshotFormat } from "../lib/screenshot.ts";
import { assertSafeUrl } from "../lib/download.ts";
import { ApiError, badRequest } from "../lib/errors.ts";
import { log } from "../lib/log.ts";
import { resultCache } from "../lib/cache.ts";
import { estimateMs } from "../lib/estimate.ts";
import {
  INLINE_THRESHOLD_MS,
  spawnJob,
  waitForJob,
  getJobWithBytes,
} from "../lib/jobs.ts";
import { inc } from "../lib/metrics.ts";
import { contentDispositionHeader } from "./_disposition.ts";

const ALLOWED_FORMATS: ScreenshotFormat[] = ["png", "jpeg", "webp", "pdf"];

function parseInputs(body: Record<string, unknown>, query: Record<string, unknown>) {
  const src = { ...query, ...body };
  const url = typeof src.url === "string" ? src.url : "";
  if (!url) throw badRequest("Missing required field 'url'");
  const format = (typeof src.format === "string" ? src.format : "png").toLowerCase() as ScreenshotFormat;
  if (!ALLOWED_FORMATS.includes(format)) {
    throw badRequest(`format must be one of: ${ALLOWED_FORMATS.join(", ")}`);
  }
  const num = (k: string) => (src[k] !== undefined ? Number(src[k]) : undefined);
  const bool = (k: string) => {
    const v = src[k];
    if (v === undefined) return undefined;
    if (typeof v === "boolean") return v;
    return String(v).toLowerCase() === "true" || v === "1";
  };
  return {
    url,
    format,
    fullPage: bool("fullPage"),
    width: num("width"),
    height: num("height"),
    delayMs: num("delayMs") ?? num("delay"),
    timeoutMs: num("timeoutMs") ?? num("timeout"),
    quality: num("quality"),
    userAgent: typeof src.userAgent === "string" ? src.userAgent : undefined,
    youtubeThumbnail: bool("youtubeThumbnail") ?? bool("thumbnail"),
    sync: bool("sync"),
    async: bool("async"),
    nocache: bool("nocache"),
  };
}

export const screenshotRouter: Router = Router();

const handle = async (req: Request, res: Response, next: import("express").NextFunction) => {
  try {
    const opts = parseInputs((req.body as Record<string, unknown>) || {}, req.query as Record<string, unknown>);
    log.info(`${req.method} /api/screenshot url=${opts.url} format=${opts.format}`);
    // Validate URL eagerly so SSRF / bad-input failures show up as 400 inline,
    // not buried inside a 202'd job's failure state.
    await assertSafeUrl(opts.url);

    const estimate = estimateMs({ kind: "screenshot", url: opts.url, to: opts.format });
    const forceAsync = opts.async === true;
    const forceSync = opts.sync === true;
    const shouldAsync = !forceSync && (forceAsync || estimate > INLINE_THRESHOLD_MS);

    const cacheKey = !opts.nocache
      ? resultCache.key("screenshot", {
          url: opts.url,
          format: opts.format,
          width: opts.width,
          height: opts.height,
          quality: opts.quality,
          fullPage: !!opts.fullPage,
          ytThumb: !!opts.youtubeThumbnail,
        })
      : "";
    if (cacheKey && !forceAsync) {
      const hit = await resultCache.get(cacheKey);
      if (hit) {
        inc("screenshot_cache_hits_total", {});
        res.setHeader("content-type", hit.contentType);
        res.setHeader("content-disposition", contentDispositionHeader(hit.fileName));
        res.send(Buffer.from(hit.bytes));
        return;
      }
    }

    const worker = async () => {
      const result = await captureUrl(opts);
      const payload = {
        bytes: result.bytes,
        contentType: result.contentType,
        fileName: `screenshot.${result.extension}`,
      };
      if (cacheKey) await resultCache.set(cacheKey, payload);
      return payload;
    };

    if (shouldAsync) {
      const job = spawnJob({
        kind: "screenshot",
        estimateMs: estimate,
        input: { url: opts.url, format: opts.format },
        worker,
      });
      inc("screenshot_jobs_total", { mode: "async" });
      const base = `${(req.headers["x-forwarded-proto"] as string) || req.protocol}://${req.headers["x-forwarded-host"] || req.get("host")}`;
      res.status(202).json({
        jobId: job.id,
        kind: "screenshot",
        status: "queued",
        estimateMs: estimate,
        estimatedSeconds: Math.round(estimate / 100) / 10,
        statusUrl: `${base}/api/jobs/${job.id}`,
        resultUrl: `${base}/api/jobs/${job.id}/result`,
        streamUrl: `${base}/api/jobs/${job.id}/stream`,
        pollAfterMs: Math.max(200, Math.min(estimate / 2, 3_000)),
      });
      return;
    }

    inc("screenshot_jobs_total", { mode: "sync" });
    const job = spawnJob({ kind: "screenshot", estimateMs: estimate, input: { url: opts.url, format: opts.format }, worker });
    const finished = await waitForJob(job.id, Math.max(2_000, estimate * 5));
    if (finished.status === "failed") throw new ApiError(500, finished.error || "Screenshot failed");
    const internal = getJobWithBytes(job.id);
    if (!internal?.result) throw new ApiError(500, "Result vanished");
    res.setHeader("content-type", internal.result.contentType);
    res.setHeader("content-disposition", contentDispositionHeader(internal.result.fileName));
    res.send(Buffer.from(internal.result.bytes));
  } catch (e) {
    next(e);
  }
};

screenshotRouter.post("/api/screenshot", handle);
screenshotRouter.get("/api/screenshot", handle);
