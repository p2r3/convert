# Worked examples

## cURL

### Screenshot any URL to PNG (sync)

```bash
curl -X POST http://localhost:3000/api/screenshot \
  -H 'content-type: application/json' \
  -d '{"url":"https://news.ycombinator.com","format":"png","fullPage":true}' \
  -o hn.png
```

### Render the page to PDF

```bash
curl -X POST http://localhost:3000/api/screenshot \
  -H 'content-type: application/json' \
  -d '{"url":"https://en.wikipedia.org/wiki/PDF","format":"pdf"}' \
  -o wikipedia.pdf
```

### Convert a local image with resize (sharp fast-path)

```bash
curl -X POST http://localhost:3000/api/convert \
  -F file=@photo.jpg -F to=webp -F quality=80 -F width=1024 \
  -o photo.webp
```

### Async screenshot of YouTube + poll

```bash
JOB=$(curl -s -X POST http://localhost:3000/api/screenshot \
  -H 'content-type: application/json' \
  -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ","format":"png"}')
JID=$(echo "$JOB" | jq -r .jobId)

# Long-poll for the result
curl -o yt.png "http://localhost:3000/api/jobs/$JID/result?wait=true&timeoutMs=30000"
```

### Download YouTube as MP3

```bash
curl -X POST http://localhost:3000/api/ytdlp \
  -H 'content-type: application/json' \
  -d '{"url":"https://www.youtube.com/watch?v=…","format":"mp3"}' \
  -o song.mp3
```

### OCR a scan into a searchable PDF

```bash
curl -X POST http://localhost:3000/api/ocr \
  -F file=@scan.png -F mode=pdf -F lang=eng \
  -o searchable.pdf
```

### Batch convert several photos in one zip

```bash
curl -X POST http://localhost:3000/api/convert/batch \
  -F files=@a.jpg -F files=@b.jpg -F files=@c.jpg \
  -F 'items=[
    {"fileIndex":0,"to":"webp","width":1024},
    {"fileIndex":1,"to":"avif","quality":60},
    {"fileIndex":2,"to":"png"}
  ]' \
  -o photos.zip
```

---

## JavaScript / Node 18+

```js
const API = "http://localhost:3000";

async function screenshot(url) {
  const res = await fetch(`${API}/api/screenshot`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url, format: "png", fullPage: true }),
  });
  if (res.status === 200) return new Uint8Array(await res.arrayBuffer());
  if (res.status === 202) {
    const job = await res.json();
    return await waitForResult(job);
  }
  throw new Error(await res.text());
}

async function waitForResult(job) {
  const r = await fetch(`${job.resultUrl}?wait=true&timeoutMs=60000`);
  if (!r.ok) throw new Error(`Job failed: ${await r.text()}`);
  return new Uint8Array(await r.arrayBuffer());
}

const png = await screenshot("https://example.com");
console.log("got", png.byteLength, "bytes");
```

### Stream a job's progress

```js
const job = await (await fetch(`${API}/api/ytdlp`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ url: "https://…", format: "mp3", async: true }),
})).json();

const es = new EventSource(job.streamUrl);
es.addEventListener("update", (ev) => {
  const j = JSON.parse(ev.data);
  process.stdout.write(`\rprogress: ${(j.progress * 100).toFixed(0)}%`);
});
es.addEventListener("done", async () => {
  es.close();
  const r = await fetch(job.resultUrl);
  // ... save bytes ...
});
```

---

## Python

```python
import requests
import time

API = "http://localhost:3000"

def convert(file_path, to, **kw):
    with open(file_path, "rb") as f:
        r = requests.post(f"{API}/api/convert",
            files={"file": f},
            data={"to": to, **kw})
    if r.status_code == 200:
        return r.content
    if r.status_code == 202:
        return wait_for_job(r.json())
    r.raise_for_status()

def wait_for_job(job):
    while True:
        r = requests.get(job["resultUrl"], params={"wait": "true", "timeoutMs": 60000})
        if r.status_code == 200:
            return r.content
        if r.status_code == 202:
            time.sleep(2)
            continue
        r.raise_for_status()

bytes_ = convert("photo.jpg", "webp", quality=80)
open("photo.webp", "wb").write(bytes_)
```
