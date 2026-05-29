# Async jobs

Long-running operations would otherwise tie up an HTTP connection for tens of seconds. convert-api estimates every operation's duration up front and falls back to async mode when the estimate exceeds **100ms** (configurable via `CONVERT_API_INLINE_THRESHOLD_MS`).

## When you get a job back

- The response is **HTTP 202**.
- Body is a JSON descriptor with `jobId`, `estimateMs`, `estimatedSeconds`, `statusUrl`, `resultUrl`, `streamUrl`, `pollAfterMs`.
- The work is already in progress in the background.

```bash
$ curl -s -X POST -H 'content-type: application/json' \
    -d '{"url":"https://www.youtube.com/watch?v=…","format":"png"}' \
    http://localhost:3000/api/screenshot
{
  "jobId": "8b1f8e6a-21ad-4f8e-9ac9-3f8da4d8a9b1",
  "kind": "screenshot",
  "status": "queued",
  "estimateMs": 6000,
  "estimatedSeconds": 6.0,
  "statusUrl":  "http://localhost:3000/api/jobs/8b1f…",
  "resultUrl":  "http://localhost:3000/api/jobs/8b1f…/result",
  "streamUrl":  "http://localhost:3000/api/jobs/8b1f…/stream",
  "pollAfterMs": 3000
}
```

## Three ways to fetch the result

### 1. Long-poll the result URL

```bash
curl -o out.png "$RESULT_URL?wait=true&timeoutMs=30000"
```

The server blocks until the job finishes (or `timeoutMs`) and returns the binary.

### 2. Poll the status URL

```bash
while true; do
  s=$(curl -s "$STATUS_URL" | jq -r .status)
  echo "status=$s"
  [ "$s" = "complete" ] && break
  [ "$s" = "failed" ] && exit 1
  sleep 2
done
curl -o out.png "$RESULT_URL"
```

### 3. Server-Sent Events stream

```bash
curl -N "$STREAM_URL"
# event: snapshot
# data: { ... initial job state ... }
# event: update
# data: { ..., "progress": 0.42 }
# event: done
# data: { ..., "status": "complete" }
```

In JavaScript:

```js
const es = new EventSource(streamUrl);
es.addEventListener("update", (ev) => {
  const job = JSON.parse(ev.data);
  console.log("progress", job.progress);
});
es.addEventListener("done", async () => {
  es.close();
  const res = await fetch(resultUrl);
  // ... handle bytes ...
});
```

## Force inline / force async

| Query | Effect |
|---|---|
| `?sync=true` | Block in the same request even if the estimate says otherwise. |
| `?async=true` | Always return 202 + jobId even for fast operations. |
| `?nocache=true` | Skip the result cache (always run fresh). |

## Cancellation

```bash
curl -X DELETE "$STATUS_URL"
# { "ok": true, "status": "cancelled" }
```

The job's `AbortSignal` is fired; workers that respect it (yt-dlp, tesseract, fetch-based downloads) stop. Workers that don't yet observe the signal will run to completion, but the result is discarded.

## Estimates

Hand-tuned heuristics in `server/lib/estimate.ts`:

| Operation | Estimate |
|---|---|
| sharp on ≤ 256KB image | 80ms |
| sharp on ≤ 2MB image | 250ms |
| sharp on > 50MB image | 8s |
| URL screenshot | 3s (6s for YouTube) |
| URL screenshot → PDF | +1s |
| browser converter (WASM) | 25s |
| yt-dlp | 60s |
| OCR (per MB) | 1.5–20s |
| Transcribe | 30s |

These are intentionally conservative — better to issue an unnecessary jobId than to lock up a connection.

## Job lifecycle + TTL

`queued → running → complete | failed | cancelled`. Completed and failed jobs stay in the store for `CONVERT_API_JOB_TTL_MS` (default 1h), so polling clients have a window to fetch results. After TTL, the job (and its bytes) are evicted.

## Listing

```bash
curl -s 'http://localhost:3000/api/jobs?status=running' | jq
curl -s 'http://localhost:3000/api/jobs?kind=screenshot' | jq
```
