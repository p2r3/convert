import { Router, type Request } from "express";
import multer from "multer";
import JSZip from "jszip";
import { downloadUrl } from "../lib/download.ts";
import { captureUrl, type ScreenshotFormat } from "../lib/screenshot.ts";
import { convertImage, normalizeSharpFormat } from "../lib/sharpConvert.ts";
import { isYouTubeUrl } from "../lib/youtube.ts";
import { badRequest, ApiError } from "../lib/errors.ts";
import { log } from "../lib/log.ts";
import { sanitizeFilename } from "../lib/download.ts";
import { estimateMs } from "../lib/estimate.ts";
import { INLINE_THRESHOLD_MS, spawnJob, waitForJob, getJobWithBytes } from "../lib/jobs.ts";
import { contentDispositionHeader } from "./_disposition.ts";
import { inc } from "../lib/metrics.ts";

const MAX_BATCH = Number(process.env.CONVERT_API_BATCH_MAX_ITEMS) || 32;
const MAX_UPLOAD_BYTES = Number(process.env.CONVERT_API_MAX_UPLOAD_BYTES) || 200 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: MAX_BATCH },
});

const SCREENSHOT_FORMATS: ScreenshotFormat[] = ["png", "jpeg", "webp", "pdf"];

interface BatchItem {
  url?: string;
  to: string;
  from?: string;
  width?: number;
  height?: number;
  quality?: number;
  /** Index into the uploaded files array (for multipart). */
  fileIndex?: number;
}

export const batchRouter: Router = Router();

batchRouter.post("/api/convert/batch", upload.array("files", MAX_BATCH), async (req, res, next) => {
  try {
    const body = (req.body || {}) as { items?: unknown; async?: unknown; sync?: unknown };
    let items: BatchItem[];
    try {
      const raw = typeof body.items === "string" ? JSON.parse(body.items) : body.items;
      items = Array.isArray(raw) ? (raw as BatchItem[]) : [];
    } catch {
      throw badRequest("'items' must be a JSON array");
    }
    if (items.length === 0) throw badRequest("At least one item required");
    if (items.length > MAX_BATCH) throw badRequest(`Too many items (max ${MAX_BATCH})`);
    const wantAsync = body.async === true || body.async === "true";
    const wantSync = body.sync === true || body.sync === "true";

    const files = ((req as Request & { files?: Express.Multer.File[] }).files || []) as Express.Multer.File[];
    const childEstimates = items.map((it) =>
      it.url
        ? estimateMs({ kind: SCREENSHOT_FORMATS.includes(it.to as ScreenshotFormat) ? "screenshot" : "sharp", url: it.url, to: it.to })
        : estimateMs({ kind: "sharp", bytes: files[it.fileIndex ?? 0]?.size ?? 1024 * 1024 }),
    );
    const totalEstimate = estimateMs({ kind: "batch", childrenMs: childEstimates.reduce((a, b) => a + b, 0) });
    const shouldAsync = !wantSync && (wantAsync || totalEstimate > INLINE_THRESHOLD_MS);

    const worker = async (setProgress: (n: number) => void) => {
      const zip = new JSZip();
      let done = 0;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        try {
          const result = await runOne(it, files);
          zip.file(safeZipName(result.fileName, i), Buffer.from(result.bytes));
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          zip.file(`error_${i}.txt`, `Item ${i} failed: ${msg}\n${JSON.stringify(it)}`);
        }
        done++;
        setProgress(done / items.length);
      }
      const zipBytes = await zip.generateAsync({ type: "uint8array" });
      return {
        bytes: zipBytes,
        contentType: "application/zip",
        fileName: `batch_${Date.now()}.zip`,
      };
    };

    if (shouldAsync) {
      const job = spawnJob({
        kind: "batch",
        estimateMs: totalEstimate,
        input: { itemCount: items.length },
        worker: async ({ setProgress }) => worker(setProgress),
      });
      inc("batch_jobs_total", { mode: "async" });
      const base = `${(req.headers["x-forwarded-proto"] as string) || req.protocol}://${req.headers["x-forwarded-host"] || req.get("host")}`;
      res.status(202).json({
        jobId: job.id,
        kind: "batch",
        status: "queued",
        estimateMs: totalEstimate,
        estimatedSeconds: Math.round(totalEstimate / 100) / 10,
        itemCount: items.length,
        statusUrl: `${base}/api/jobs/${job.id}`,
        resultUrl: `${base}/api/jobs/${job.id}/result`,
        streamUrl: `${base}/api/jobs/${job.id}/stream`,
      });
      return;
    }

    inc("batch_jobs_total", { mode: "sync" });
    const job = spawnJob({
      kind: "batch",
      estimateMs: totalEstimate,
      input: { itemCount: items.length },
      worker: async ({ setProgress }) => worker(setProgress),
    });
    const finished = await waitForJob(job.id, Math.max(5_000, totalEstimate * 5));
    if (finished.status === "failed") throw new ApiError(500, finished.error || "Batch failed");
    const internal = getJobWithBytes(job.id);
    if (!internal?.result) throw new ApiError(500, "Batch produced no result");
    res.setHeader("content-type", internal.result.contentType);
    res.setHeader("content-disposition", contentDispositionHeader(internal.result.fileName));
    res.send(Buffer.from(internal.result.bytes));
  } catch (e) {
    next(e);
  }
});

async function runOne(it: BatchItem, files: Express.Multer.File[]) {
  if (!it.to) throw badRequest("Each batch item needs 'to'");
  // URL + screenshot target → screenshot.
  if (it.url && SCREENSHOT_FORMATS.includes(it.to as ScreenshotFormat) && (!isLikelyFileUrl(it.url) || isYouTubeUrl(it.url))) {
    const r = await captureUrl({
      url: it.url,
      format: it.to as ScreenshotFormat,
      width: it.width,
      height: it.height,
      quality: it.quality,
    });
    return { bytes: r.bytes, contentType: r.contentType, fileName: `screenshot.${r.extension}` };
  }
  // Otherwise download/use the file then sharp.
  let bytes: Uint8Array;
  let name: string;
  if (it.url) {
    const dl = await downloadUrl(it.url);
    bytes = dl.bytes;
    name = dl.fileName;
  } else {
    const file = files[it.fileIndex ?? 0];
    if (!file) throw badRequest(`Batch item references missing file index ${it.fileIndex}`);
    bytes = new Uint8Array(file.buffer);
    name = file.originalname;
  }
  const sharpTo = normalizeSharpFormat(it.to);
  if (!sharpTo) {
    throw badRequest(`Batch only supports sharp targets (got '${it.to}'). Use /api/convert for browser-driven targets.`);
  }
  const r = await convertImage({ bytes, to: sharpTo, width: it.width, height: it.height, quality: it.quality });
  if (!r) throw new ApiError(500, "sharp unavailable");
  // Preserve original name with new extension where reasonable.
  const base = name.replace(/\.[^.]+$/, "");
  return { bytes: r.bytes, contentType: r.contentType, fileName: `${base}.${r.extension}` };
}

function safeZipName(name: string, idx: number): string {
  const safe = sanitizeFilename(name);
  return `${String(idx).padStart(3, "0")}_${safe}`;
}

function isLikelyFileUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    const last = u.pathname.split("/").filter(Boolean).pop() || "";
    const m = /\.([a-z0-9]{1,6})$/i.exec(last);
    if (!m) return false;
    const ext = m[1].toLowerCase();
    if (["html", "htm", "php", "aspx", "asp", "jsp", "cgi"].includes(ext)) return false;
    return true;
  } catch {
    return false;
  }
}

log.info(`Batch endpoint loaded (max items: ${MAX_BATCH})`);
