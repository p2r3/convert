import { afterAll, expect, test } from "bun:test";
import puppeteer from "puppeteer";

// The same build as test/commonFormats.test.ts, served with the headers that make a page
// cross-origin isolated. That switches FFmpeg, ONNX Runtime and OxiPNG to their threaded builds.
/** Serves the build, with or without the two isolation headers. */
function serve(isolated: boolean) {
  return Bun.serve({
    async fetch(req) {
      let path = new URL(req.url).pathname.replace("/convert/", "") || "index.html";
      path = path.replaceAll("..", "");
      if (path.startsWith("/test/")) path = "../test/resources/" + path.slice(6);
      const file = Bun.file(`${__dirname}/../dist/${path}`);
      if (!(await file.exists())) return new Response("Not Found", { status: 404 });
      if (!isolated) return new Response(file);
      return new Response(file, {
        headers: {
          "Cross-Origin-Opener-Policy": "same-origin",
          "Cross-Origin-Embedder-Policy": "require-corp",
        },
      });
    },
    port: 0,
  });
}

const server = serve(true);

const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
const page = await browser.newPage();
const logs: string[] = [];
await Promise.all([
  new Promise((resolve) => {
    page.on("console", (msg) => {
      logs.push(msg.text());
      if (msg.text() === "Built initial format list.") resolve(null);
    });
  }),
  page.goto(`http://localhost:${server.port}/convert/index.html`),
]);

afterAll(async () => {
  await browser.close();
  await server.stop(true);
});

/** Converts a file of test/resources, or a generated 256 × 256 PNG when `file` is "noise.png". */
function convert(file: string, from: object, to: object) {
  return page.evaluate(
    async (file, from, to) => {
      let bytes: Uint8Array;
      if (file === "noise.png") {
        const canvas = new OffscreenCanvas(256, 256);
        const ctx = canvas.getContext("2d")!;
        const pixels = ctx.createImageData(256, 256);
        for (let i = 0; i < pixels.data.length; i++) {
          pixels.data[i] = i % 4 === 3 ? 255 : (i * 31) % 256;
        }
        ctx.putImageData(pixels, 0, 0);
        bytes = new Uint8Array(await (await canvas.convertToBlob()).arrayBuffer());
      } else {
        bytes = await fetch("/test/" + file).then((r) => r.bytes());
      }
      const inputSize = bytes.length;
      const handler = { name: "dummy" };
      const result = await (window as any).tryConvertByTraversing(
        [{ name: file, bytes }],
        { format: from, handler },
        { format: to, handler },
      );
      return (
        result && {
          inputSize,
          size: result.files[0].bytes.length as number,
          handler: result.path.at(-1).handler.name as string,
        }
      );
    },
    file,
    from,
    to,
  );
}

const PNG = { mime: "image/png", format: "png" };
const MP4 = { mime: "video/mp4", format: "mp4" };

test("the page is cross-origin isolated", async () => {
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
});

test(
  "FFmpeg encodes H.264 with its multithreaded core",
  async () => {
    const mkv = await convert("doom.mp4", MP4, { mime: "video/x-matroska", format: "matroska" });

    expect(mkv?.handler).toBe("FFmpeg");
    expect(mkv!.size).toBeGreaterThan(10000);
    expect(logs).toContain("[FFmpeg] Reloading FFmpeg with threads...");
  },
  { timeout: 120000 },
);

test(
  "FFmpeg keeps to one thread where its encoders can hang with more",
  async () => {
    const before = logs.length;
    // with the multithreaded core this conversion never finished
    const gif = await convert("doom.mp4", MP4, { mime: "image/gif", format: "gif" });

    expect(gif?.handler).toBe("FFmpeg");
    expect(gif!.size).toBeGreaterThan(10000);
    expect(logs.slice(before)).toContain("[FFmpeg] Reloading FFmpeg...");
    expect(logs.slice(before)).not.toContain("[FFmpeg] Reloading FFmpeg with threads...");
  },
  { timeout: 120000 },
);

test(
  "OxiPNG compresses a PNG in a worker with threads",
  async () => {
    const png = await convert("noise.png", PNG, PNG);

    expect(png?.handler).toBe("oxipng");
    expect(png!.size).toBeLessThanOrEqual(png!.inputSize);
  },
  { timeout: 60000 },
);

test(
  "background removal runs on ONNX Runtime with threads",
  async () => {
    const cut = await convert("colors_50x50.png", PNG, { mime: "image/png", format: "nobg" });

    expect(cut?.handler).toBe("removeBg");
    expect(cut!.size).toBeGreaterThan(100);
  },
  { timeout: 120000 },
);

test(
  "the service worker isolates a page whose host sends no headers",
  async () => {
    const plain = serve(false);
    // any name but localhost, where the page leaves the service worker out
    const origin = `http://convert.test:${plain.port}`;
    const other = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--host-resolver-rules=MAP convert.test 127.0.0.1",
        // a service worker needs a secure context, which plain HTTP is only on localhost
        `--unsafely-treat-insecure-origin-as-secure=${origin}`,
      ],
    });
    try {
      const tab = await other.newPage();
      await tab.goto(`${origin}/convert/index.html`);

      // The page registers the worker and reloads under it. Asked again and again, because
      // the reload can come at any moment and takes the answer to a question in flight with it.
      let isolated = false;
      for (let i = 0; i < 60 && !isolated; i++) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        isolated = await tab
          .evaluate(() => crossOriginIsolated && !!(window as any).handlerDefs?.length)
          .catch(() => false);
      }

      expect(isolated).toBe(true);
      expect(await tab.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    } finally {
      await other.close();
      await plain.stop(true);
    }
  },
  { timeout: 120000 },
);

test("on localhost the page registers no service worker", async () => {
  const plain = serve(false);
  const tab = await browser.newPage();
  try {
    await Promise.all([
      new Promise((resolve) => {
        tab.on("console", (msg) => {
          if (msg.text() === "Built initial format list.") resolve(null);
        });
      }),
      tab.goto(`http://localhost:${plain.port}/convert/index.html`),
    ]);

    expect(await tab.evaluate(() => crossOriginIsolated)).toBe(false);
    const registrations = await tab.evaluate(() => navigator.serviceWorker.getRegistrations());
    expect(registrations).toHaveLength(0);
  } finally {
    await tab.close();
    await plain.stop(true);
  }
});
