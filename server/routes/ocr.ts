import { Router, type Request } from "express";
import multer from "multer";
import { ocr, tesseractAvailable } from "../lib/ocr.ts";
import { downloadUrl } from "../lib/download.ts";
import { ApiError, badRequest } from "../lib/errors.ts";
import { log } from "../lib/log.ts";
import { resultCache } from "../lib/cache.ts";
import { estimateMs } from "../lib/estimate.ts";
import { INLINE_THRESHOLD_MS, spawnJob, waitForJob, getJobWithBytes } from "../lib/jobs.ts";
import { inc } from "../lib/metrics.ts";
import { contentDispositionHeader } from "./_disposition.ts";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024, files: 1 },
});

export const ocrRouter: Router = Router();

ocrRouter.get("/api/ocr/status", async (_req, res) => {
  res.json({ available: await tesseractAvailable() });
});

ocrRouter.post("/api/ocr", upload.single("file"), async (req, res, next) => {
  try {
    const body = (req.body || {}) as Record<string, unknown>;
    const query = (req.query || {}) as Record<string, unknown>;
    const src = { ...query, ...body };
    const mode = (typeof src.mode === "string" ? src.mode : "txt") as "txt" | "pdf" | "hocr" | "tsv";
    if (!["txt", "pdf", "hocr", "tsv"].includes(mode)) throw badRequest(`mode must be txt/pdf/hocr/tsv`);
    const lang = typeof src.lang === "string" ? src.lang : "eng";
    const urlIn = typeof src.url === "string" ? src.url : undefined;
    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file && !urlIn) throw badRequest("Provide a 'file' upload or a 'url'");

    log.info(`POST /api/ocr mode=${mode} lang=${lang} url=${urlIn ?? ""} file=${file?.originalname ?? ""}`);

    let bytes: Uint8Array;
    let fileExt: string | undefined;
    if (file) {
      bytes = new Uint8Array(file.buffer);
      fileExt = file.originalname.split(".").pop()?.toLowerCase();
    } else {
      const dl = await downloadUrl(urlIn!);
      bytes = dl.bytes;
      fileExt = dl.fileName.split(".").pop()?.toLowerCase();
    }

    const estimate = estimateMs({ kind: "ocr", bytes: bytes.byteLength });
    const cacheKey = resultCache.key("ocr", { mode, lang, hash: hashBytes(bytes) });
    if (src.nocache !== "1" && src.nocache !== true) {
      const hit = await resultCache.get(cacheKey);
      if (hit) {
        inc("ocr_cache_hits_total", {});
        res.setHeader("content-type", hit.contentType);
        res.setHeader("content-disposition", contentDispositionHeader(hit.fileName));
        res.send(Buffer.from(hit.bytes));
        return;
      }
    }
    const forceAsync = src.async === true || src.async === "true";
    const forceSync = src.sync === true || src.sync === "true";
    const shouldAsync = !forceSync && (forceAsync || estimate > INLINE_THRESHOLD_MS);

    const worker = async (_setProgress: (n: number) => void, signal: AbortSignal) => {
      const result = await ocr({ bytes, fileExt, mode, lang, signal });
      const payload = { bytes: result.bytes, contentType: result.contentType, fileName: result.fileName };
      await resultCache.set(cacheKey, payload);
      return payload;
    };

    if (shouldAsync) {
      const job = spawnJob({
        kind: "ocr",
        estimateMs: estimate,
        input: { mode, lang, fileExt },
        worker: async ({ setProgress, signal }) => worker(setProgress, signal),
      });
      inc("ocr_jobs_total", { mode: "async" });
      const base = `${(req.headers["x-forwarded-proto"] as string) || req.protocol}://${req.headers["x-forwarded-host"] || req.get("host")}`;
      res.status(202).json({
        jobId: job.id,
        kind: "ocr",
        status: "queued",
        estimateMs: estimate,
        estimatedSeconds: Math.round(estimate / 100) / 10,
        statusUrl: `${base}/api/jobs/${job.id}`,
        resultUrl: `${base}/api/jobs/${job.id}/result`,
      });
      return;
    }

    inc("ocr_jobs_total", { mode: "sync" });
    const job = spawnJob({
      kind: "ocr",
      estimateMs: estimate,
      input: { mode, lang, fileExt },
      worker: async ({ setProgress, signal }) => worker(setProgress, signal),
    });
    const finished = await waitForJob(job.id, Math.max(20_000, estimate * 5));
    if (finished.status === "failed") throw new ApiError(500, finished.error || "OCR failed");
    const internal = getJobWithBytes(job.id);
    if (!internal?.result) throw new ApiError(500, "Result vanished");
    res.setHeader("content-type", internal.result.contentType);
    res.setHeader("content-disposition", contentDispositionHeader(internal.result.fileName));
    res.send(Buffer.from(internal.result.bytes));
  } catch (e) {
    next(e);
  }
});

import { createHash } from "node:crypto";
function hashBytes(b: Uint8Array): string {
  return createHash("sha256").update(b).digest("hex");
}
