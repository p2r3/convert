# Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  Express server (port 3000)                  │
│                                                              │
│  metrics ─┐                                                  │
│  auth  ───┤   GET/POST routes ─► route handlers ─► planner   │
│  CORS  ───┘                                                  │
│                              │                               │
│                              ▼                               │
│                       ┌───────────────┐                      │
│                       │ Conversion    │                      │
│                       │   planner     │                      │
│                       │ (decides kind │                      │
│                       │  + estimateMs)│                      │
│                       └─────┬─────────┘                      │
│                             │                                │
│       estimate ≤ 100ms ─────┼──── estimate > 100ms           │
│                             │                                │
│            inline run       │       spawnJob ─► 202 + jobId  │
│                             │                                │
│                             ▼                                │
│                    ┌────────────────┐                        │
│                    │  Worker (one of)│                        │
│                    └─┬──────┬───────┘                        │
│       sharp ◄────────┘      └────► Puppeteer page pool       │
│       yt-dlp                       (shared singleton browser)│
│       tesseract                                              │
│       whisper/OpenAI                                         │
│       browser converter (drives original WASM app)           │
│                                                              │
│  result cache (mem + disk, sha256 keyed)                     │
│  job store (TTL'd in-memory) ◄── SSE stream + webhooks      │
└──────────────────────────────────────────────────────────────┘
```

## Components

### Conversion planner (`server/routes/convert.ts`)
Decides one of: `screenshot`, `sharp`, `downloadConvert`, `browserConvert`. The plan carries an estimate (ms) and a cache key.

### Estimator (`server/lib/estimate.ts`)
Heuristic durations by kind + input size. Used to choose inline vs job mode.

### Job system (`server/lib/jobs.ts`)
In-memory store with TTL. Each job: `queued → running → complete | failed | cancelled`. Emits events for SSE.
**Threshold:** `CONVERT_API_INLINE_THRESHOLD_MS` (default 100). Lower estimate → run inline; higher → return 202 with `jobId` and `estimateMs`.

### Result cache (`server/lib/cache.ts`)
sha256-keyed memory + disk cache. Disk path: `CONVERT_API_CACHE_DIR` (default `/tmp/convert-api-cache`). Max bytes / age tunable.

### Browser singleton (`server/lib/browser.ts`)
Single Puppeteer process. `withPage` enforces a Node-side deadline. `withBrowserSlot` serializes concurrent work via a FIFO queue (`CONVERT_API_MAX_CONCURRENCY`, default 2). Auto-relaunches on disconnect. `warmBrowser` runs on startup.

### Format tracker (`server/lib/formatTracker.ts`)
Snapshots the format list to disk on each /api/formats hit; diffs vs prior snapshot; emits `added`/`removed` events to SSE listeners + registered webhooks.

### Metrics (`server/lib/metrics.ts`)
Custom Prometheus exporter (no dep). Counters: requests, jobs by kind/mode, cache hits. Histogram: request latency. Live gauges injected on `/metrics` (job states, cache size, browser-pool depth).

## Request lifecycle (POST /api/convert)

1. **Auth + rate-limit** middleware (no-op when no `CONVERT_API_KEYS` set).
2. **Parse** body/query/multipart into `ConvertInputs`.
3. **Plan**: pick path + estimate.
4. **Cache check**: sha256(kind + params); hit → respond inline.
5. **Threshold check**: estimate ≤ inline threshold → run inline, await, respond; otherwise → spawn job, return 202.
6. **Worker** runs in async context; updates `progress` and ultimately writes result + cache entry.
7. **Client** polls `/api/jobs/{id}` (or SSE-streams `/api/jobs/{id}/stream`) then GETs `/api/jobs/{id}/result`.

## Layered conversion engine

When a job actually runs, it dispatches through:

| Path | When | Notes |
|---|---|---|
| `captureUrl` (Puppeteer) | URL → png/jpeg/webp/pdf and URL is webpage-ish (no file extension) or YouTube | YouTube path hides chrome and consents |
| `sharp` | image → image (PNG, JPEG, WEBP, AVIF, TIFF, GIF, HEIF) | Native, fast |
| `ytdlpFetch` | `/api/ytdlp` or YouTube → audio in `/api/transcribe` | Spawns `yt-dlp` binary |
| `ocr` (Tesseract) | `/api/ocr` | Spawns `tesseract` binary |
| `transcribe` (Whisper) | `/api/transcribe` | OpenAI API or local `whisper` CLI |
| `convertViaBrowser` | Anything else | Drives the original browser converter via Puppeteer (requires `dist/`) |
