import { Router, type Request } from "express";
import multer from "multer";
import { transcribe, whisperCliAvailable } from "../lib/transcribe.ts";
import { downloadUrl } from "../lib/download.ts";
import { ytdlpAvailable, ytdlpFetch } from "../lib/ytdlp.ts";
import { isYouTubeUrl } from "../lib/youtube.ts";
import { ApiError, badRequest } from "../lib/errors.ts";
import { log } from "../lib/log.ts";
import { resultCache } from "../lib/cache.ts";
import { estimateMs } from "../lib/estimate.ts";
import { INLINE_THRESHOLD_MS, spawnJob, waitForJob, getJobWithBytes } from "../lib/jobs.ts";
import { inc } from "../lib/metrics.ts";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024, files: 1 },
});

export const transcribeRouter: Router = Router();

transcribeRouter.get("/api/transcribe/status", async (_req, res) => {
  res.json({
    openai: !!process.env.OPENAI_API_KEY,
    whisperCli: await whisperCliAvailable(),
    summarize: !!process.env.ANTHROPIC_API_KEY,
    ytdlp: await ytdlpAvailable(),
  });
});

transcribeRouter.post("/api/transcribe", upload.single("file"), async (req, res, next) => {
  try {
    const body = (req.body || {}) as Record<string, unknown>;
    const query = (req.query || {}) as Record<string, unknown>;
    const src = { ...query, ...body };
    const lang = typeof src.language === "string" ? src.language : undefined;
    const summarize = src.summarize === true || src.summarize === "true";
    const urlIn = typeof src.url === "string" ? src.url : undefined;
    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file && !urlIn) throw badRequest("Provide a 'file' upload or a 'url'");

    log.info(`POST /api/transcribe lang=${lang ?? "auto"} summarize=${summarize} url=${urlIn ?? ""}`);

    const estimate = estimateMs({ kind: "transcribe" });
    const forceAsync = src.async === true || src.async === "true";
    const forceSync = src.sync === true || src.sync === "true";
    const shouldAsync = !forceSync && (forceAsync || estimate > INLINE_THRESHOLD_MS);

    const fetchInput = async (signal: AbortSignal): Promise<{ bytes: Uint8Array; ext: string }> => {
      if (file) {
        return {
          bytes: new Uint8Array(file.buffer),
          ext: (file.originalname.split(".").pop() || "mp3").toLowerCase(),
        };
      }
      if (urlIn && isYouTubeUrl(urlIn) && (await ytdlpAvailable())) {
        const yt = await ytdlpFetch({ url: urlIn, format: "mp3", signal });
        return { bytes: yt.bytes, ext: "mp3" };
      }
      const dl = await downloadUrl(urlIn!);
      const ext = (dl.fileName.split(".").pop() || "mp3").toLowerCase();
      return { bytes: dl.bytes, ext };
    };

    const worker = async (setProgress: (n: number) => void, signal: AbortSignal) => {
      setProgress(0.1);
      const input = await fetchInput(signal);
      setProgress(0.4);
      const result = await transcribe({
        bytes: input.bytes,
        fileExt: input.ext,
        language: lang,
        summarize,
        signal,
      });
      const json = JSON.stringify(result, null, 2);
      return {
        bytes: new Uint8Array(Buffer.from(json, "utf8")),
        contentType: "application/json",
        fileName: "transcript.json",
        metadata: { backend: result.backend, language: result.language, hasSummary: !!result.summary },
      };
    };

    if (shouldAsync) {
      const job = spawnJob({
        kind: "transcribe",
        estimateMs: estimate,
        input: { url: urlIn, lang, summarize },
        worker: async ({ setProgress, signal }) => worker(setProgress, signal),
      });
      inc("transcribe_jobs_total", { mode: "async" });
      const base = `${(req.headers["x-forwarded-proto"] as string) || req.protocol}://${req.headers["x-forwarded-host"] || req.get("host")}`;
      res.status(202).json({
        jobId: job.id,
        kind: "transcribe",
        status: "queued",
        estimateMs: estimate,
        estimatedSeconds: Math.round(estimate / 100) / 10,
        statusUrl: `${base}/api/jobs/${job.id}`,
        resultUrl: `${base}/api/jobs/${job.id}/result`,
      });
      return;
    }

    inc("transcribe_jobs_total", { mode: "sync" });
    const job = spawnJob({
      kind: "transcribe",
      estimateMs: estimate,
      input: { url: urlIn, lang, summarize },
      worker: async ({ setProgress, signal }) => worker(setProgress, signal),
    });
    const finished = await waitForJob(job.id, Math.max(60_000, estimate * 5));
    if (finished.status === "failed") throw new ApiError(500, finished.error || "Transcription failed");
    const internal = getJobWithBytes(job.id);
    if (!internal?.result) throw new ApiError(500, "Result vanished");
    res.setHeader("content-type", internal.result.contentType);
    res.send(Buffer.from(internal.result.bytes));
  } catch (e) {
    next(e);
  }
});

void resultCache; // reserved for future per-bytes-hash caching
