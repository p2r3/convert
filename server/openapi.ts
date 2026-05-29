/**
 * OpenAPI 3.1 spec served at `/openapi.json` and a tiny Swagger UI bootstrap
 * at `/docs`. We hand-write the spec to avoid a heavy dependency on schema-to-
 * openapi tooling — the surface is small enough.
 */

import { Router } from "express";

export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "convert-api",
    version: "1.1.0",
    description:
      "REST API for file/URL conversion built on Express + Puppeteer. Inline for fast jobs, async with job IDs and progress streaming for slow ones.",
  },
  servers: [{ url: "/" }],
  components: {
    schemas: {
      JobAccepted: {
        type: "object",
        properties: {
          jobId: { type: "string" },
          kind: { type: "string" },
          status: { type: "string", enum: ["queued"] },
          estimateMs: { type: "integer" },
          estimatedSeconds: { type: "number" },
          statusUrl: { type: "string" },
          resultUrl: { type: "string" },
          streamUrl: { type: "string" },
          pollAfterMs: { type: "integer" },
        },
        required: ["jobId", "kind", "status", "estimateMs", "statusUrl", "resultUrl"],
      },
      Job: {
        type: "object",
        properties: {
          id: { type: "string" },
          kind: { type: "string" },
          status: { type: "string", enum: ["queued", "running", "complete", "failed", "cancelled"] },
          createdAt: { type: "integer" },
          startedAt: { type: "integer" },
          finishedAt: { type: "integer" },
          estimateMs: { type: "integer" },
          progress: { type: "number" },
          error: { type: "string" },
        },
      },
      Error: { type: "object", properties: { error: { type: "string" } }, required: ["error"] },
    },
    parameters: {
      sync: { name: "sync", in: "query", schema: { type: "boolean" }, description: "Force inline (block) mode." },
      async: { name: "async", in: "query", schema: { type: "boolean" }, description: "Force async (job) mode." },
      nocache: { name: "nocache", in: "query", schema: { type: "boolean" }, description: "Bypass result cache." },
    },
  },
  paths: {
    "/health": {
      get: {
        summary: "Liveness + capability probe",
        responses: { "200": { description: "OK" } },
      },
    },
    "/metrics": {
      get: {
        summary: "Prometheus metrics",
        responses: { "200": { description: "text/plain; version=0.0.4" } },
      },
    },
    "/api/formats": {
      get: {
        summary: "List supported formats",
        parameters: [
          { name: "category", in: "query", schema: { type: "string" } },
          { name: "direction", in: "query", schema: { type: "string", enum: ["to", "from"] } },
        ],
        responses: { "200": { description: "Format list" } },
      },
    },
    "/api/screenshot": {
      post: {
        summary: "Render a URL to PNG/JPEG/WEBP/PDF",
        parameters: [
          { $ref: "#/components/parameters/sync" },
          { $ref: "#/components/parameters/async" },
          { $ref: "#/components/parameters/nocache" },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["url"],
                properties: {
                  url: { type: "string" },
                  format: { type: "string", enum: ["png", "jpeg", "webp", "pdf"] },
                  fullPage: { type: "boolean" },
                  width: { type: "integer" },
                  height: { type: "integer" },
                  delayMs: { type: "integer" },
                  quality: { type: "integer" },
                  youtubeThumbnail: { type: "boolean" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Binary result inline (sync mode)" },
          "202": {
            description: "Job accepted",
            content: { "application/json": { schema: { $ref: "#/components/schemas/JobAccepted" } } },
          },
          "400": { description: "Bad request", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/convert": {
      post: {
        summary: "Convert a file/URL to any supported format",
        parameters: [
          { $ref: "#/components/parameters/sync" },
          { $ref: "#/components/parameters/async" },
          { $ref: "#/components/parameters/nocache" },
        ],
        requestBody: {
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  file: { type: "string", format: "binary" },
                  to: { type: "string" },
                  from: { type: "string" },
                  width: { type: "integer" },
                  height: { type: "integer" },
                  quality: { type: "integer" },
                },
              },
            },
            "application/json": {
              schema: {
                type: "object",
                required: ["to"],
                properties: {
                  url: { type: "string" },
                  to: { type: "string" },
                  from: { type: "string" },
                  width: { type: "integer" },
                  height: { type: "integer" },
                  quality: { type: "integer" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Binary result (sync)" }, "202": { description: "Job accepted" } },
      },
    },
    "/api/convert/batch": {
      post: {
        summary: "Convert many inputs in one request; result is a zip",
        responses: { "200": { description: "ZIP archive (sync)" }, "202": { description: "Job accepted" } },
      },
    },
    "/api/ytdlp": {
      post: {
        summary: "Download audio/video from YouTube and other sites via yt-dlp",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["url"],
                properties: {
                  url: { type: "string" },
                  format: { type: "string", description: "mp3, m4a, mp4, webm, best, bestaudio …" },
                  quality: { type: "string", description: "720p, 1080p, etc." },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Media file" }, "202": { description: "Job accepted" }, "503": { description: "yt-dlp not installed" } },
      },
    },
    "/api/ytdlp/status": {
      get: { summary: "Probe yt-dlp availability", responses: { "200": { description: "OK" } } },
    },
    "/api/ocr": {
      post: {
        summary: "OCR image/PDF via Tesseract",
        requestBody: {
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  file: { type: "string", format: "binary" },
                  url: { type: "string" },
                  mode: { type: "string", enum: ["txt", "pdf", "hocr", "tsv"] },
                  lang: { type: "string" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "OCR result" }, "202": { description: "Job accepted" }, "503": { description: "tesseract not installed" } },
      },
    },
    "/api/ocr/status": { get: { summary: "Probe tesseract availability", responses: { "200": { description: "OK" } } } },
    "/api/transcribe": {
      post: {
        summary: "Speech-to-text via Whisper (+ optional Claude summary)",
        responses: {
          "200": { description: "Transcript JSON" },
          "202": { description: "Job accepted" },
          "503": { description: "No backend configured" },
        },
      },
    },
    "/api/transcribe/status": { get: { summary: "Probe transcription backends", responses: { "200": { description: "OK" } } } },
    "/api/jobs": {
      get: {
        summary: "List jobs",
        responses: { "200": { description: "OK" } },
      },
    },
    "/api/jobs/{id}": {
      get: { summary: "Get job snapshot", responses: { "200": { description: "OK" }, "404": { description: "Not found" } } },
      delete: { summary: "Cancel/delete a job", responses: { "200": { description: "OK" } } },
    },
    "/api/jobs/{id}/result": {
      get: {
        summary: "Fetch job result bytes",
        parameters: [
          { name: "wait", in: "query", schema: { type: "boolean" } },
          { name: "timeoutMs", in: "query", schema: { type: "integer" } },
        ],
        responses: {
          "200": { description: "Result body" },
          "202": { description: "Still running" },
          "500": { description: "Job failed" },
        },
      },
    },
    "/api/jobs/{id}/stream": {
      get: { summary: "Server-Sent Events stream of job updates", responses: { "200": { description: "event-stream" } } },
    },
  },
} as const;

export const docsRouter: Router = Router();

docsRouter.get("/openapi.json", (_req, res) => {
  res.json(openApiSpec);
});

docsRouter.get("/docs", (_req, res) => {
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html lang="en"><head>
  <meta charset="utf-8">
  <title>convert-api — docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
</head><body>
<div id="swagger"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>
  window.ui = SwaggerUIBundle({
    url: "/openapi.json",
    dom_id: "#swagger",
    deepLinking: true,
    presets: [SwaggerUIBundle.presets.apis],
    layout: "BaseLayout",
  });
</script>
</body></html>`);
});
