# API reference

All endpoints accept either JSON (`application/json`) or form bodies, and use `inline` Content-Disposition for binary responses. Sync/async behaviour:

- **Inline** (default for fast jobs, < 100ms estimate): the request blocks and the body is returned directly.
- **Async** (default for slow jobs): the server returns **HTTP 202** with a JSON job descriptor — poll `/api/jobs/{id}` or stream `/api/jobs/{id}/stream`, then fetch `/api/jobs/{id}/result`.
- Force one mode with `?sync=true` or `?async=true`.

## Job descriptor (HTTP 202)

```json
{
  "jobId": "8b1f8e6a-21ad-4f8e-9ac9-3f8da4d8a9b1",
  "kind": "screenshot",
  "status": "queued",
  "estimateMs": 3000,
  "estimatedSeconds": 3.0,
  "statusUrl": "http://host/api/jobs/8b1f8e6a-…",
  "resultUrl": "http://host/api/jobs/8b1f8e6a-…/result",
  "streamUrl": "http://host/api/jobs/8b1f8e6a-…/stream",
  "pollAfterMs": 1500
}
```

---

## Endpoints

### `GET /health`

Liveness + capability probe.

```bash
curl -s http://localhost:3000/health | jq
```

### `GET /metrics`

Prometheus text-format metrics. Includes live gauges (`convert_api_jobs_state`, `convert_api_cache_*`, `convert_api_browser_*`) and histograms (`http_request_duration_seconds`).

### `GET /api/formats[?category=image&direction=to]`

Lists supported formats (native fast-path + the WASM converter cache when `dist/cache.json` exists). Every call reconciles the snapshot so newly added formats fire change events.

### `POST /api/screenshot`  /  `GET /api/screenshot`

| Field | Type | Default | Notes |
|---|---|---|---|
| `url` | string | — | required |
| `format` | `png \| jpeg \| webp \| pdf` | `png` | |
| `fullPage` | boolean | `false` | render full scroll height |
| `width` / `height` | int | 1366 / 900 | viewport size |
| `delayMs` | int | 0 | wait after load |
| `quality` | int | 90 | jpeg/webp |
| `userAgent` | string | — | override |
| `youtubeThumbnail` | boolean | `false` | YT only: fetch the thumbnail JPG |

```bash
curl -X POST http://localhost:3000/api/screenshot \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.com","format":"png","fullPage":true}' \
  -o example.png

# Force async (always returns 202)
curl -X POST 'http://localhost:3000/api/screenshot?async=true' \
  -H 'content-type: application/json' \
  -d '{"url":"https://a-slow-site.example/","format":"pdf"}'
```

### `POST /api/convert`

Multipart **or** JSON body. One of `file` (multipart) or `url` (JSON/form) required, plus `to`.

| Field | Type | Notes |
|---|---|---|
| `to` | string | **required** — output extension, e.g. `png`, `webp`, `mp3`, `pdf` |
| `from` | string | optional input override |
| `width`/`height` | int | raster output sizing |
| `quality` | int | jpeg/webp/avif |
| `file` | upload | up to `CONVERT_API_MAX_UPLOAD_BYTES` (default 200MB) |
| `url` | string | remote file or webpage |

```bash
# Local file → WebP via sharp fast-path
curl -X POST http://localhost:3000/api/convert \
  -F file=@photo.jpg -F to=webp -F quality=80 \
  -o photo.webp

# URL → PNG screenshot
curl -X POST http://localhost:3000/api/convert \
  -H 'content-type: application/json' \
  -d '{"url":"https://news.ycombinator.com","to":"png"}' \
  -o hn.png

# Remote PNG → JPEG (download + sharp)
curl -X POST http://localhost:3000/api/convert \
  -H 'content-type: application/json' \
  -d '{"url":"https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png","to":"jpeg","quality":85}' \
  -o demo.jpg
```

### `POST /api/convert/batch`

Convert many inputs in one request. Result is a zip. Mix uploaded files (`fileIndex`) and URLs in the same batch.

```bash
curl -X POST http://localhost:3000/api/convert/batch \
  -F files=@a.png -F files=@b.png \
  -F 'items=[
    {"fileIndex":0,"to":"webp","quality":80},
    {"fileIndex":1,"to":"jpeg","width":256},
    {"url":"https://example.com","to":"png"}
  ]' \
  -o out.zip
```

### `POST /api/ytdlp`

Download audio/video via `yt-dlp` (must be installed — see deployment.md). Works on YouTube and the many sites yt-dlp supports.

```bash
# YouTube → MP3
curl -X POST http://localhost:3000/api/ytdlp \
  -H 'content-type: application/json' \
  -d '{"url":"https://www.youtube.com/watch?v=…","format":"mp3"}' \
  -o song.mp3

# 720p mp4
curl -X POST 'http://localhost:3000/api/ytdlp' \
  -H 'content-type: application/json' \
  -d '{"url":"https://…","format":"mp4","quality":"720p"}' \
  -o clip.mp4
```

`GET /api/ytdlp/status` reports whether the binary is available.

### `POST /api/ocr`

OCR an image or PDF page. Modes: `txt` (default), `pdf` (searchable), `hocr`, `tsv`.

```bash
curl -X POST http://localhost:3000/api/ocr \
  -F file=@scan.png -F mode=pdf -F lang=eng \
  -o searchable.pdf
```

`GET /api/ocr/status` reports tesseract availability.

### `POST /api/transcribe`

Speech-to-text. Backends (tried in order): OpenAI Whisper API (`OPENAI_API_KEY`), then local `whisper` CLI. Optional `summarize=true` runs the transcript through Claude (`ANTHROPIC_API_KEY`).

```bash
# Transcribe an uploaded audio file
curl -X POST http://localhost:3000/api/transcribe \
  -F file=@meeting.mp3 -F language=en \
  -o transcript.json

# Transcribe a YouTube URL (auto-downloads via yt-dlp) + summary
curl -X POST http://localhost:3000/api/transcribe \
  -H 'content-type: application/json' \
  -d '{"url":"https://www.youtube.com/watch?v=…","summarize":true}'
```

### Job endpoints

- `GET /api/jobs` — list (filter with `?status=` and `?kind=`).
- `GET /api/jobs/{id}` — JSON snapshot.
- `DELETE /api/jobs/{id}` — cancel (if running) or delete.
- `GET /api/jobs/{id}/result[?wait=true&timeoutMs=120000]` — fetch result bytes. `wait=true` blocks until the job finishes.
- `GET /api/jobs/{id}/stream` — Server-Sent Events: `event: update`, `event: done`.

### Format-update subscriptions

- `GET /api/formats/changes[?limit=50]` — recent additions/removals.
- `GET /api/formats/stream` — SSE feed of changes.
- `POST /api/subscriptions/formats` `{ url, secret?, events? }` — webhook subscription.
- `GET /api/subscriptions/formats` — list (secrets masked).
- `DELETE /api/subscriptions/formats/{id}` — unsubscribe.

See [format-updates.md](./format-updates.md).

## Error format

```json
{ "error": "Human-readable explanation" }
```

| Status | Meaning |
|---|---|
| 400 | Bad input (validation, SSRF guard, missing fields) |
| 404 | Job or subscription not found |
| 413 | Upload exceeds size limit |
| 415 | Format not supported on the chosen path |
| 429 | Rate-limit exceeded (token bucket per key or IP) |
| 500 | Worker failure |
| 502 | External tool failed (yt-dlp, tesseract, OpenAI API, …) |
| 503 | Backend not installed/configured (graceful degradation) |
