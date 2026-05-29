import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import { resolve, dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { healthRouter } from "./routes/health.ts";
import { formatsRouter, formatsUpdateRouter } from "./routes/formats.ts";
import { screenshotRouter } from "./routes/screenshot.ts";
import { convertRouter } from "./routes/convert.ts";
import { batchRouter } from "./routes/batch.ts";
import { ytdlpRouter } from "./routes/ytdlp.ts";
import { ocrRouter } from "./routes/ocr.ts";
import { transcribeRouter } from "./routes/transcribe.ts";
import { jobsRouter } from "./routes/jobs.ts";
import { metricsRouter } from "./routes/metrics.ts";
import { docsRouter } from "./openapi.ts";
import { ApiError } from "./lib/errors.ts";
import { closeBrowser, warmBrowser } from "./lib/browser.ts";
import { authMiddleware } from "./lib/auth.ts";
import { metricsMiddleware } from "./lib/metrics.ts";
import { log } from "./lib/log.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";

const projectRoot = resolve(__dirname, "..");
const distDir = resolve(projectRoot, "dist");
const publicDir = resolve(__dirname, "public");

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(metricsMiddleware());
app.use(authMiddleware());

// API routers
app.use(healthRouter);
app.use(formatsRouter);
app.use(formatsUpdateRouter);
app.use(screenshotRouter);
app.use(convertRouter);
app.use(batchRouter);
app.use(ytdlpRouter);
app.use(ocrRouter);
app.use(transcribeRouter);
app.use(jobsRouter);
app.use(metricsRouter);
app.use(docsRouter);

// Serve the static browser converter (used by /api/convert browser fallback).
if (existsSync(distDir)) {
  app.use("/convert", express.static(distDir, { fallthrough: true, index: "index.html" }));
}

// Static API docs / landing.
app.use(express.static(publicDir, { fallthrough: true, index: "index.html" }));

// 404
app.use((req, res) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
});

// Error handler
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (res.headersSent) return;
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err && typeof err === "object" && "type" in err && (err as { type: string }).type === "entity.too.large") {
    res.status(413).json({ error: "Request body too large" });
    return;
  }
  if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ error: "Uploaded file exceeds size limit" });
    return;
  }
  log.error("unhandled error:", err);
  const msg = err instanceof Error ? err.message : String(err);
  res.status(500).json({ error: msg });
};
app.use(errorHandler);

const server = app.listen(PORT, HOST, () => {
  log.info(`convert-api listening on http://${HOST}:${PORT}`);
  log.info(`  static converter: ${existsSync(distDir) ? "available at /convert/" : "MISSING (run npm run build)"}`);
  log.info(`  docs at /docs (OpenAPI at /openapi.json), metrics at /metrics`);
  log.info(`  routes: /api/screenshot /api/convert /api/convert/batch /api/ytdlp /api/ocr /api/transcribe /api/jobs /api/formats`);
  if (process.env.CONVERT_API_WARM_BROWSER !== "0") {
    void warmBrowser();
  }
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info(`Received ${signal}, shutting down…`);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await closeBrowser();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

export { app, server };
