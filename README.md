# convert-api

> **This is a fork of [p2r3/convert](https://github.com/p2r3/convert).**
> Upstream is a browser-side WASM converter; this fork wraps it with an Express REST API, headless Chromium, native fast-paths via `sharp`, and integrations for `yt-dlp`, Tesseract OCR, and Whisper transcription. All upstream format handlers continue to work and are exposed through `/api/convert`.

REST API on top of the [Convert to it!](https://convert.to.it/) browser converter. Express server with on-demand headless Chromium, native image fast-paths via `sharp`, URL → image/PDF screenshots, YouTube handling, and the existing 90+ WASM format handlers wired in as a fallback.

## Documentation

In-repo docs:

- [docs/architecture.md](./docs/architecture.md) — components, request lifecycle, layering
- [docs/api.md](./docs/api.md) — every endpoint with cURL examples
- [docs/jobs.md](./docs/jobs.md) — async jobs, the 100ms threshold, polling/SSE/cancel
- [docs/examples.md](./docs/examples.md) — worked examples (cURL, JS, Python)
- [docs/deployment.md](./docs/deployment.md) — Docker, env vars, nginx, scaling
- [docs/format-updates.md](./docs/format-updates.md) — subscribe to new conversions (SSE + webhooks)
- [docs/contributing.md](./docs/contributing.md) — how to add endpoints/handlers/tests

Runtime: hit **`/docs`** on the running server for the Swagger UI, or **`/openapi.json`** for the raw spec.

## What's new in this fork

| Capability | Endpoint | Notes |
|---|---|---|
| URL → image/PDF | `POST /api/screenshot` | Puppeteer; YouTube-aware (player hide + consent dismiss); thumbnail shortcut |
| File/URL → any format | `POST /api/convert` | Sharp fast-path for raster, browser-converter fallback for the 90+ WASM handlers |
| Batch | `POST /api/convert/batch` | Many inputs → one zip |
| YouTube download | `POST /api/ytdlp` | mp3/m4a/mp4/webm; 720p/1080p; via `yt-dlp` |
| OCR | `POST /api/ocr` | `txt`/`pdf`/`hocr`/`tsv` via Tesseract |
| Transcribe + summarize | `POST /api/transcribe` | OpenAI Whisper API or local `whisper`; Claude summary optional |
| Async jobs | `GET /api/jobs/:id[/result\|/stream]` | 100ms threshold flips inline → 202 + jobId |
| Format-update subscriptions | `POST /api/subscriptions/formats` | Webhooks + SSE feed when handlers are added |
| Result cache | sha256-keyed mem + disk | Idempotent jobs return instantly |
| Persistent browser | warmed on startup, queued FIFO | `CONVERT_API_MAX_CONCURRENCY` |
| Prometheus metrics | `GET /metrics` | Job state gauges, latency histograms |
| Swagger UI | `GET /docs` | Live OpenAPI 3.1 explorer |

## Quick start

```bash
bun install
bun run server          # starts http://localhost:3000
```

Then:

```bash
# URL → PNG
curl -X POST http://localhost:3000/api/screenshot \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.com","format":"png","fullPage":true}' \
  -o example.png

# File upload → WEBP (sharp fast-path, no browser spin-up)
curl -X POST http://localhost:3000/api/convert \
  -F file=@photo.jpg -F to=webp -F quality=80 \
  -o photo.webp

# Remote file URL → JPEG
curl -X POST http://localhost:3000/api/convert \
  -H 'content-type: application/json' \
  -d '{"url":"https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png","to":"jpeg","quality":85}' \
  -o demo.jpg

# YouTube → thumbnail (no browser; direct fetch)
curl -G 'http://localhost:3000/api/screenshot' \
  --data-urlencode 'url=https://www.youtube.com/watch?v=dQw4w9WgXcQ' \
  --data-urlencode 'youtubeThumbnail=true' \
  -o yt.jpg

# YouTube → screenshot the player (full headless browser)
curl -G 'http://localhost:3000/api/screenshot' \
  --data-urlencode 'url=https://www.youtube.com/watch?v=dQw4w9WgXcQ' \
  -o yt.png
```

## Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness + whether the browser converter dist is built. |
| GET | `/api/formats` | List supported formats. `?category=image`, `?direction=to\|from`. |
| GET / POST | `/api/screenshot` | URL → `png`/`jpeg`/`webp`/`pdf`. |
| POST | `/api/convert` | File upload or URL → any supported format. |

### POST /api/screenshot

JSON body or form fields:

| Field | Type | Default | Notes |
|---|---|---|---|
| `url` | string | — | required |
| `format` | `png`\|`jpeg`\|`webp`\|`pdf` | `png` | |
| `fullPage` | boolean | `false` | render below the fold |
| `width`/`height` | number | 1366/900 | viewport |
| `delayMs` | number | 0 | wait after load |
| `timeoutMs` | number | 45000 | total navigation timeout |
| `quality` | number | 90 | jpeg/webp |
| `userAgent` | string | — | UA override |
| `youtubeThumbnail` | boolean | `false` | fetch the thumbnail rather than render the player |

### POST /api/convert

`multipart/form-data` with a `file` field **or** JSON with a `url`.

| Field | Type | Notes |
|---|---|---|
| `to` | string | **required** — target format ext, e.g. `png`, `webp`, `mp3`, `pdf` |
| `from` | string | optional input format override (otherwise sniffed from filename/MIME) |
| `width`/`height` | number | applied when output is a raster image |
| `quality` | number | 1–100 for `jpeg`/`webp`/`avif` |
| `file` | upload | up to `CONVERT_API_MAX_UPLOAD_BYTES` (200MB default) |
| `url` | string | remote file or webpage |

Conversion strategy (first hit wins):

1. **URL + image/PDF target → screenshot**. Detects YouTube and renders the player frame; pass `youtubeThumbnail=true` to grab the thumbnail directly.
2. **Image → image** uses [`sharp`](https://sharp.pixelplumbing.com/) for PNG/JPEG/WEBP/AVIF/TIFF/GIF/HEIF.
3. **Anything else** drives the existing browser-based converter via Puppeteer (requires `bun run build` first).

## Configuration

| Env var | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | bind address |
| `PUPPETEER_EXECUTABLE_PATH` | — | use a pre-installed Chromium |
| `CONVERT_API_MAX_CONCURRENCY` | `2` | concurrent browser-driven jobs |
| `CONVERT_API_MAX_UPLOAD_BYTES` | `209715200` | multer upload limit |
| `CONVERT_API_IGNORE_CERT_ERRORS` | `0` | pass `--ignore-certificate-errors` + `acceptInsecureCerts` (dev only) |
| `NODE_ENV` | — | non-`production` also enables cert ignore for dev convenience |

## Tests

```bash
bun run test:server     # spins up the app, hits every endpoint family
bun run server:typecheck
```

## Unlocking the full 90+ format converter

The Express layer covers screenshots, common image transcodes, and download-then-convert via URL. The original WASM-powered converter (94 handlers covering audio, video, fonts, archives, chess PGN, MIDI synth, etc.) is wired in as a Puppeteer fallback for anything not covered by the fast paths. To enable it:

```bash
# (one-time) make sure submodules are pulled
git submodule update --init --recursive
bun run build           # produces dist/ — picked up automatically at runtime
bun run cache:build:dev # speeds up first conversion by pre-caching the format graph
```

After that, `POST /api/convert` will fall through to the browser-driven path for, say, `aseprite` → `gif`, `pgn` → `svg`, `wav` → `mp3`, and so on.

---

# [Convert to it!](https://convert.to.it/) (original browser app)
**Truly universal online file converter.**

Many online file conversion tools are **boring** and **insecure**. They only allow conversion between two formats in the same medium (images to images, videos to videos, etc.), and they require that you _upload your files to some server_.

This is not just terrible for privacy, it's also incredibly lame. What if you _really_ need to convert an AVI video to a PDF document? Try to find an online tool for that, I dare you.

[Convert.to.it](https://convert.to.it/) aims to be a tool that "just works". You're almost _guaranteed_ to get an output - perhaps not always the one you expected, but it'll try its best to not leave you hanging.

For a semi-technical overview of this tool, check out the video: https://youtu.be/btUbcsTbVA8

## Usage

1. Go to [convert.to.it](https://convert.to.it/)
2. Click the big blue box to add your file (or just drag it on to the window).
3. An input format should have been automatically selected. If it wasn't, yikes! Try searching for it, or if it's really not there, see the "Issues" section below.
4. Select an output format from the second list. If you're on desktop, that's the one on the right side. If you're on mobile, it'll be somewhere lower down.
5. Click **Convert**!
6. Hopefully, after a bit (or a lot) of thinking, the program will spit out the file you wanted. If not, see the "Issues" section below.

## Issues

Ever since the YouTube video released, we've been getting spammed with issues suggesting the addition of all kinds of niche file formats. To keep things organized, I've decided to specify what counts as a valid issue and what doesn't.

> [!IMPORTANT]
> **SIMPLY ASKING FOR A FILE FORMAT TO BE ADDED IS NOT A MEANINGFUL ISSUE!**

There are thousands of file formats out there. It can take hours to add support for just one. The math is simple - we can't possibly support every single file. As such, simply listing your favorite file formats is not helpful. We already know that there are formats we don't support, we don't need tickets to tell us that.

When suggesting a file format, you must _at minimum_:
- Make sure that there isn't already an issue about the same thing, and that we don't already support the format.
- Explain what you expect the conversion to be like (what medium is it converting to/from). It's important to note here that simply parsing the underlying data is _not sufficient_. Imagine if we only treated SVG images as raw XML data and didn't support converting them to raster images - that would defeat the point. In other words, try to avoid crude "binary waterfalls".
- Provide links to existing browser-based solutions if possible, or at the very least a reference for implementing the format, and make sure the license is compatible with GPL-2.0.

If this seems like a lot, please remember - a developer will have to do 100x more work to actually implement the format. Doing a bit of research not only saves them precious time, it also weeds out "unserious" proposals that would only bloat our to-do list.

**If you're submitting a bug report,** you only need to do step 1 - check if the problem isn't already reported by someone else. Bug reports are generally quite important otherwise.

Though please note, "converting X to Y doesn't work" is **not** a bug report.  However, "converting X to Y works but not how I expected" likely **is** a bug report.

## Deployment

### Local development (Bun + Vite)

1. Clone this repository ***WITH SUBMODULES***. You can use `git clone --recursive https://github.com/p2r3/convert` for that. Omitting submodules will leave you missing a few dependencies.
2. Install [Bun](https://bun.sh/).
3. Run `bun install` to install dependencies.
4. Run `bunx vite` to start the development server.

_The following steps are optional, but recommended for performance:_

When you first open the page, it'll take a while to generate the list of supported formats for each tool. If you open the console, you'll see it complaining a bunch about missing caches.

After this is done (indicated by a `Built initial format list` message in the console), use `printSupportedFormatCache()` to get a JSON string with the cache data. You can then save this string to `cache.json` to skip that loading screen on startup.

If you run into issues where your changes seem to not be applying, try disabling this cache.

### Docker (prebuilt image)

Docker compose files live in the `docker/` directory, so run compose with `-f` from the repository root:

```bash
docker compose -f docker/docker-compose.yml up -d
```

Alternatively download the `docker-compose.yml` separately and start it by executing `docker compose up -d` in the same directory.

This runs the container on `http://localhost:8080/convert/`.

### Docker (local build for development)

Use the override file to build the image locally:

```bash
docker compose -f docker/docker-compose.yml -f docker/docker-compose.override.yml up --build -d
```

The first Docker build is expected to be slow because Chromium and related system packages are installed in the build stage (needed for puppeteer in `buildCache.js`). Later builds are usually much faster due to Docker layer caching.

## Contributing

The best way to contribute is by adding support for new file formats (duh). If you don't have a format to add but are eager to help, take a look at our issues. There are plenty of suggestions there.

Here's how adding a format works works:

### Creating a handler

Each "tool" used for conversion has to be normalized to a standard form - effectively a "wrapper" that abstracts away the internal processes. These wrappers are available in [src/handlers](src/handlers/).

Below is a super barebones handler that does absolutely nothing. You can use this as a starting point for adding a new format:

```ts
// file: dummy.ts

import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats from "src/CommonFormats.ts";

class dummyHandler implements FormatHandler {

  public name: string = "dummy";
  public supportedFormats?: FileFormat[];
  public ready: boolean = false;

  async init () {
    this.supportedFormats = [
      // Example PNG format, with both input and output disabled
      CommonFormats.PNG.builder("png")
        .markLossless()
        .allowFrom(false)
        .allowTo(false),

      // Alternatively, if you need a custom format, define it like so:
      {
        name: "CompuServe Graphics Interchange Format (GIF)",
        format: "gif",
        extension: "gif",
        mime: "image/gif",
        from: false,
        to: false,
        internal: "gif",
        category: ["image", "video"],
        lossless: false
      },
    ];
    this.ready = true;
  }

  async doConvert (
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];
    return outputFiles;
  }

}

export default dummyHandler;
```

For more details on how all of these components work, refer to the doc comments in [src/FormatHandler.ts](src/FormatHandler.ts). You can also take a look at existing handlers to get a more practical example.

There are a few additional things that I want to point out in particular:

- Pay attention to the naming system. If your tool is called `dummy`, then the class should be called `dummyHandler`, and the file should be called `dummy.ts`.
- The handler is responsible for setting the output file's name. This is done to allow for flexibility in rare cases where the _full_ file name matters. Of course, in most cases, you'll only have to swap the file extension.
- The handler is also responsible for ensuring that any byte buffers that enter or exit the handler _do not get mutated_. If necessary, clone the buffer by wrapping it in `new Uint8Array()`.
- When handling MIME types, run them through [normalizeMimeType](src/normalizeMimeType.ts) first. One file can have multiple valid MIME types, which isn't great when you're trying to match them algorithmically.
- When implementing/suggesting a new file format, please treat the file as the media that it represents, not the data that it contains. For example, if you were making an SVG handler, you should treat the file as an _image_, not as XML. In other words, avoid simple "binary waterfalls", as they're not semantically meaningful.

### Testing

This project currently uses two levels of tests:

- Broad project-level tests live directly in `test/` (for example graph traversal and end-to-end conversion smoke tests).
- Optional handler-specific unit tests live in `test/handlers/`, using the file name pattern `<handlerName>.test.ts`. These are a good fit for handlers with meaningful parsing, serialization, or file-naming logic that is hard to exercise reliably through traversal alone.

Not every handler needs a dedicated unit test, but handlers with non-trivial custom internal logic may benefit from having one.

### Adding dependencies

If your tool requires an external dependency (which it likely does), there are currently two well-established ways of going about this:

- If it's an `npm` package, just install it to the project like you normally would.
- If it's a Git repository, add it as a submodule to [src/handlers](src/handlers).
- If neither of the above are available, then **as a last resort**, you may create a folder with the required assets under `src/handlers/handlerName`.

**Please try to avoid CDNs (Content Delivery Networks).** They're really cool on paper, but they don't work well with TypeScript, and each one introduces a tiny bit of instability. For a project that leans heavily on external dependencies, those bits of instability can add up fast.

- If you need to load a WebAssembly binary (or similar), add its path to [vite.config.js](vite.config.js) and target it under `/convert/wasm/`. **Do not link to node_modules**.

### AI Usage Policy

If you intend to use an LLM, agent-enabled IDE, or other AI-driven tool for your contribution, please follow these guidelines:

- Clearly state that you've used an LLM, ideally in your pull request's description. Do not attempt to pass off an AI's work as your own. I'm far more likely to accept a pull request that openly admits to using AI than one that does but pretends it doesn't. Transparency helps the maintainer (me) know what to keep an eye out for (e.g. hallucinations), and helps you keep yourself in check.
- Do not overindulge. If your contribution is trivial or simple enough to be written by hand, please opt to write it by hand. This is especially true if it's your first contribution. You're much more likely to retain knowledge and understanding about architectural details if you've familiarized yourself with the process hands-on first.
- Keep the scope to things you _could_ do by hand. LLMs are tools, and this is a community-driven project. Orchestrating an AI to write logic that you don't fully comprehend is not only reckless for a community project, it's also disrespectful towards human contributors who took the time to research their additions. In other words, there should _never_ be a scenario where you _need_ an LLM.
- Explain what you (and the LLM) are doing, in a way that makes it clear that you understand the changes you're making.

Not adhering to these rules will likely get your pull request closed.

I figure that there are people who'd prefer if I merged _zero_ AI-written code, but I believe that's simply not feasible. Just from a code integrity perspective, it's much safer to be transparent about AI usage and define clear guidelines than to make it a taboo and risk people "sneaking in" unvetted AI code. Making things illegal doesn't stop everyone from doing those things - some will still do them, just in secret and with less oversight.
