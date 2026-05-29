/**
 * Lightweight server smoke tests. Spins up the Express app on a free port and
 * exercises each endpoint family. Skips browser-driven cases if Chromium isn't
 * available or the network blocks the test URL.
 *
 * Run with: `bun run test:server` (or `tsx test/server/run.ts`).
 */

import { createServer } from "node:http";
import { setTimeout as wait } from "node:timers/promises";
import express from "express";
import { healthRouter } from "../../server/routes/health.ts";
import { formatsRouter } from "../../server/routes/formats.ts";
import { screenshotRouter } from "../../server/routes/screenshot.ts";
import { convertRouter } from "../../server/routes/convert.ts";
import { ApiError } from "../../server/lib/errors.ts";
import { closeBrowser } from "../../server/lib/browser.ts";
import { isYouTubeUrl, youtubeVideoId } from "../../server/lib/youtube.ts";
import { assertSafeUrl, sanitizeFilename } from "../../server/lib/download.ts";
import { convertImage, normalizeSharpFormat } from "../../server/lib/sharpConvert.ts";

interface TestCase {
  name: string;
  run: () => Promise<void>;
}

const results: Array<{ name: string; status: "pass" | "fail" | "skip"; message?: string }> = [];

function ok(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

function eq<T>(actual: T, expected: T, msg: string): void {
  if (actual !== expected) {
    throw new Error(`${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

async function makeFixturePng(): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  return sharp({ create: { width: 32, height: 32, channels: 3, background: { r: 200, g: 50, b: 50 } } })
    .png()
    .toBuffer();
}

async function startApp(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(healthRouter);
  app.use(formatsRouter);
  app.use(screenshotRouter);
  app.use(convertRouter);
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (res.headersSent) return;
    if (err instanceof ApiError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  });
  const server = createServer(app);
  await new Promise<void>((res) => server.listen(0, "127.0.0.1", res));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no addr");
  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    close: () =>
      new Promise<void>((res) => {
        server.close(() => res());
      }),
  };
}

async function probe(url: string): Promise<boolean> {
  // Reachable if the host accepts our connection AND isn't blocked by a sandbox
  // policy (CI environments often deny outbound to most hosts).
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 4000);
    try {
      const r = await fetch(url, { method: "HEAD", signal: ctl.signal });
      if (r.headers.get("x-deny-reason")) return false;
      // 2xx/3xx → fine. 4xx/5xx usually means the host *is* up; trust it.
      return r.status >= 100 && r.status < 500;
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    // Cert errors / TLS issues still indicate the host is up; only treat
    // ECONNREFUSED, ENOTFOUND, and timeouts as unreachable.
    const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
    if (msg.includes("certificate") || msg.includes("ssl") || msg.includes("tls")) return true;
    return false;
  }
}

async function run(): Promise<void> {
  const { baseUrl, close } = await startApp();
  const cases: TestCase[] = [
    {
      name: "GET /health returns ok",
      run: async () => {
        const r = await fetch(`${baseUrl}/health`);
        eq(r.status, 200, "status");
        const j = (await r.json()) as { ok: boolean; browserConverterAvailable: boolean };
        ok(j.ok === true, "ok flag");
        ok(typeof j.browserConverterAvailable === "boolean", "browserConverterAvailable type");
      },
    },
    {
      name: "GET /api/formats returns native formats",
      run: async () => {
        const r = await fetch(`${baseUrl}/api/formats`);
        eq(r.status, 200, "status");
        const j = (await r.json()) as { count: number; formats: Array<{ format: string }> };
        ok(j.count >= 7, "at least 7 native formats");
        ok(j.formats.some((f) => f.format === "png"), "includes png");
      },
    },
    {
      name: "GET /api/formats?category=image filters",
      run: async () => {
        const r = await fetch(`${baseUrl}/api/formats?category=image`);
        const j = (await r.json()) as { formats: Array<{ category?: string | string[] }> };
        ok(
          j.formats.every((f) => {
            const cats = Array.isArray(f.category) ? f.category : f.category ? [f.category] : [];
            return cats.includes("image");
          }),
          "all in image category",
        );
      },
    },
    {
      name: "POST /api/screenshot rejects missing url",
      run: async () => {
        const r = await fetch(`${baseUrl}/api/screenshot`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        });
        eq(r.status, 400, "status");
      },
    },
    {
      name: "POST /api/screenshot rejects unknown format",
      run: async () => {
        const r = await fetch(`${baseUrl}/api/screenshot`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url: "https://example.com", format: "tiff" }),
        });
        eq(r.status, 400, "status");
      },
    },
    {
      name: "POST /api/screenshot rejects private IPs (SSRF guard)",
      run: async () => {
        const r = await fetch(`${baseUrl}/api/screenshot`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url: "http://127.0.0.1/" }),
        });
        eq(r.status, 400, "status");
        const j = (await r.json()) as { error: string };
        ok(/private IP|Refusing/.test(j.error), "error mentions private IP");
      },
    },
    {
      name: "POST /api/convert rejects missing inputs",
      run: async () => {
        const r = await fetch(`${baseUrl}/api/convert`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ to: "png" }),
        });
        eq(r.status, 400, "status");
      },
    },
    {
      name: "POST /api/convert rejects missing 'to'",
      run: async () => {
        const r = await fetch(`${baseUrl}/api/convert`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url: "https://example.com" }),
        });
        eq(r.status, 400, "status");
      },
    },
    {
      name: "POST /api/convert (file PNG → WEBP) via sharp",
      run: async () => {
        const png = await makeFixturePng();
        const form = new FormData();
        form.set("file", new Blob([new Uint8Array(png)], { type: "image/png" }), "fixture.png");
        form.set("to", "webp");
        form.set("quality", "85");
        const r = await fetch(`${baseUrl}/api/convert`, { method: "POST", body: form });
        eq(r.status, 200, "status");
        eq(r.headers.get("content-type"), "image/webp", "content-type");
        const buf = await r.arrayBuffer();
        // WEBP signature: RIFF .... WEBP
        const u = new Uint8Array(buf);
        const sig = String.fromCharCode(u[0], u[1], u[2], u[3]) + String.fromCharCode(u[8], u[9], u[10], u[11]);
        eq(sig, "RIFFWEBP", "webp magic");
      },
    },
    {
      name: "POST /api/convert (file PNG → JPEG with resize) via sharp",
      run: async () => {
        const png = await makeFixturePng();
        const form = new FormData();
        form.set("file", new Blob([new Uint8Array(png)], { type: "image/png" }), "fixture.png");
        form.set("to", "jpeg");
        form.set("width", "16");
        const r = await fetch(`${baseUrl}/api/convert`, { method: "POST", body: form });
        eq(r.status, 200, "status");
        eq(r.headers.get("content-type"), "image/jpeg", "content-type");
        const buf = await r.arrayBuffer();
        const u = new Uint8Array(buf);
        // JPEG signature
        ok(u[0] === 0xff && u[1] === 0xd8 && u[2] === 0xff, "jpeg magic");
      },
    },
    {
      name: "youtube utils detect YouTube URLs and extract ids",
      run: async () => {
        ok(isYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "watch");
        ok(isYouTubeUrl("https://youtu.be/dQw4w9WgXcQ"), "youtu.be");
        ok(isYouTubeUrl("https://m.youtube.com/shorts/dQw4w9WgXcQ"), "shorts");
        ok(!isYouTubeUrl("https://example.com"), "non-yt");
        eq(youtubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ", "watch id");
        eq(youtubeVideoId("https://youtu.be/dQw4w9WgXcQ?si=foo"), "dQw4w9WgXcQ", "youtu.be id");
        eq(youtubeVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ"), "dQw4w9WgXcQ", "embed id");
        eq(youtubeVideoId("https://example.com"), null, "non-yt id null");
      },
    },
    {
      name: "assertSafeUrl rejects bad protocols and private hosts",
      run: async () => {
        await assertSafeUrl("https://example.com");
        let threw = false;
        try { await assertSafeUrl("file:///etc/passwd"); } catch { threw = true; }
        ok(threw, "file:// rejected");
        threw = false;
        try { await assertSafeUrl("http://127.0.0.1/"); } catch { threw = true; }
        ok(threw, "loopback rejected");
        threw = false;
        try { await assertSafeUrl("http://169.254.169.254/"); } catch { threw = true; }
        ok(threw, "link-local rejected");
      },
    },
    {
      name: "sanitizeFilename blocks CR/LF and traversal",
      run: async () => {
        eq(sanitizeFilename("normal.png"), "normal.png", "passthrough");
        // Path separators replaced with `_` and leading dots stripped — no traversal possible.
        ok(!sanitizeFilename("../../etc/passwd").includes("/"), "no forward slash");
        ok(!sanitizeFilename("../../etc/passwd").includes("\\"), "no backslash");
        ok(!sanitizeFilename("../../etc/passwd").startsWith("."), "no leading dot");
        const crlf = sanitizeFilename("x\r\nSet-Cookie: a=1");
        ok(!/[\r\n]/.test(crlf), "no CR/LF");
        ok(!sanitizeFilename("..\\..\\..\\nt.bat").includes("\\"), "no backslash (win)");
        eq(sanitizeFilename(""), "download.bin", "empty");
        ok(sanitizeFilename("a".repeat(500) + ".png").endsWith(".png"), "preserves ext when capped");
        ok(sanitizeFilename("a".repeat(500) + ".png").length <= 200, "length capped");
      },
    },
    {
      name: "sharp format normalizer",
      run: async () => {
        eq(normalizeSharpFormat("png"), "png", "png");
        eq(normalizeSharpFormat("JPG"), "jpeg", "jpg→jpeg");
        eq(normalizeSharpFormat("jpeg"), "jpeg", "jpeg");
        eq(normalizeSharpFormat("heic"), "heif", "heic→heif");
        eq(normalizeSharpFormat("nope"), null, "unknown");
      },
    },
    {
      name: "sharp direct API converts PNG → JPEG bytes",
      run: async () => {
        const png = await makeFixturePng();
        const res = await convertImage({ bytes: new Uint8Array(png), to: "jpeg", quality: 80 });
        ok(res !== null, "got result");
        eq(res!.contentType, "image/jpeg", "content-type");
        ok(res!.bytes[0] === 0xff && res!.bytes[1] === 0xd8, "jpeg magic");
      },
    },
  ];

  // Browser-driven optional cases: only run if example.com is reachable.
  const exampleReachable = await probe("https://example.com");
  const wikimediaReachable = await probe("https://upload.wikimedia.org/");
  if (wikimediaReachable) {
    cases.push({
      name: "POST /api/convert (image URL → WEBP) downloads then transcodes via sharp",
      run: async () => {
        const r = await fetch(`${baseUrl}/api/convert`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            url: "https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png",
            to: "webp",
            quality: 70,
          }),
        });
        eq(r.status, 200, "status");
        eq(r.headers.get("content-type"), "image/webp", "content-type");
        const u = new Uint8Array(await r.arrayBuffer());
        const sig = String.fromCharCode(u[0], u[1], u[2], u[3]) + String.fromCharCode(u[8], u[9], u[10], u[11]);
        eq(sig, "RIFFWEBP", "webp magic — should be transcoded, not screenshotted");
      },
    });
  }

  if (exampleReachable) {
    cases.push({
      name: "POST /api/screenshot renders example.com to PNG",
      run: async () => {
        const r = await fetch(`${baseUrl}/api/screenshot`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url: "https://example.com", format: "png" }),
        });
        eq(r.status, 200, "status");
        eq(r.headers.get("content-type"), "image/png", "content-type");
        const buf = new Uint8Array(await r.arrayBuffer());
        ok(buf[0] === 0x89 && buf[1] === 0x50, "png magic");
      },
    });
    cases.push({
      name: "POST /api/convert (url → png screenshot)",
      run: async () => {
        const r = await fetch(`${baseUrl}/api/convert`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url: "https://example.com", to: "png" }),
        });
        eq(r.status, 200, "status");
        eq(r.headers.get("content-type"), "image/png", "content-type");
      },
    });
  } else {
    results.push({ name: "browser-driven cases", status: "skip", message: "example.com unreachable" });
  }

  for (const c of cases) {
    try {
      await c.run();
      results.push({ name: c.name, status: "pass" });
    } catch (e) {
      results.push({ name: c.name, status: "fail", message: e instanceof Error ? e.message : String(e) });
    }
  }
  await close();
  await closeBrowser();
  await wait(50);
}

await run();

let passed = 0;
let failed = 0;
let skipped = 0;
for (const r of results) {
  const tag = r.status === "pass" ? "PASS" : r.status === "skip" ? "SKIP" : "FAIL";
  const line = `  [${tag}] ${r.name}${r.message ? " — " + r.message : ""}`;
  console.log(line);
  if (r.status === "pass") passed++;
  else if (r.status === "skip") skipped++;
  else failed++;
}
console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
process.exit(failed > 0 ? 1 : 0);
