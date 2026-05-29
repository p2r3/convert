# Format-update subscriptions

The format list grows whenever a new handler ships (in this fork) or when a new entry appears in the upstream `dist/cache.json`. convert-api tracks every `/api/formats` reconciliation and emits events when formats are added or removed.

This is the answer to "how do I find out when a new conversion is supported?".

## Three ways to get updates

### 1. Recent changes (polling)

```bash
curl -s 'http://localhost:3000/api/formats/changes?limit=20' | jq
```

```json
{
  "changes": [
    {
      "id": "8d2c…",
      "at": 1717000000000,
      "type": "added",
      "format": { "format": "qoa", "mime": "audio/qoa", "name": "Quite OK Audio", ... }
    }
  ]
}
```

### 2. Server-Sent Events (streaming)

```bash
curl -N http://localhost:3000/api/formats/stream
# event: hello
# data: { ok: true, recent: [ ... ] }
# event: change
# data: { id, at, type: "added", format: { ... } }
```

Browser-side:

```js
const es = new EventSource("/api/formats/stream");
es.addEventListener("change", (ev) => {
  const { type, format } = JSON.parse(ev.data);
  console.log(type, format.format, format.mime);
});
```

### 3. Webhooks (push)

Register a callback URL. Every `added`/`removed` event POSTs a JSON body to it.

```bash
curl -X POST http://localhost:3000/api/subscriptions/formats \
  -H 'content-type: application/json' \
  -d '{
        "url": "https://my-listener.example.com/convert-api/formats",
        "secret": "supersecret",
        "events": ["added"]
      }'
# 201 -> { "id": "…", "url": "…", "events": ["added"], "createdAt": … }
```

The server posts:

```http
POST /convert-api/formats
Content-Type: application/json
X-Convert-Event: added
X-Convert-Change-Id: 8d2c…
X-Convert-Signature: sha256=<hex(sha256(secret || body))>

{
  "event": "added",
  "changeId": "8d2c…",
  "at": 1717000000000,
  "format": { ... }
}
```

Verify the signature server-side:

```js
import { createHash } from "node:crypto";
function verify(body, header, secret) {
  const expected = "sha256=" + createHash("sha256").update(secret).update(body).digest("hex");
  return header === expected;
}
```

### Managing subscriptions

```bash
# List (secrets are masked as "***")
curl http://localhost:3000/api/subscriptions/formats

# Delete
curl -X DELETE http://localhost:3000/api/subscriptions/formats/<id>
```

## Persistence + restart behavior

Snapshots, changelog, and subscription list are persisted to disk under `CONVERT_API_STATE_DIR` (default `/tmp/convert-api-state`). When the server restarts:

- The snapshot is reloaded, so the next `/api/formats` request only emits a diff if something actually changed.
- The changelog (last 500 entries) is restored.
- Webhook subscriptions resume — pointed at the same URLs, with the same secrets.

For production use, mount a persistent volume at `CONVERT_API_STATE_DIR`.

## What counts as a "change"

A format is keyed by `(mime, format)`. Adding a new handler that introduces e.g. `(audio/qoa, qoa)` triggers `added`. Removing it (or an extension change) triggers `removed`. Updating only the `name` or `category` is **not** a change in this system — by design, to keep the feed signal-heavy.
