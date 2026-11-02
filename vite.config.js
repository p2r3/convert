import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import preact from "@preact/preset-vite";
import { fileURLToPath } from "node:url";
import { createReadStream, existsSync } from "node:fs";
import { createHash } from "node:crypto";

// Cross-origin isolation gives the page SharedArrayBuffer, which the threads of FFmpeg, ONNX
// Runtime and OxiPNG are built on. Nothing here loads from another origin, so the strict
// "require-corp" costs nothing and, unlike "credentialless", every browser knows it.
const ISOLATION_HEADERS = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  publicDir: "public",
  server: { headers: ISOLATION_HEADERS },
  preview: { headers: ISOLATION_HEADERS },
  optimizeDeps: {
    include: ["turbowarp-packager", "turbowarp-unpackager"],
    exclude: [
      "@ffmpeg/ffmpeg",
      "@sqlite.org/sqlite-wasm",
      "@bokuweb/zstd-wasm",
      "@yowasp/clang",
      "@jsquash/oxipng",
    ],
  },
  base: "./",
  worker: {
    format: "es",
  },
  resolve: {
    tsconfigPaths: true,
    alias: [
      {
        find: "turbowarp-packager",
        replacement: fileURLToPath(
          new URL("./built/turbowarp-packager/packager.js", import.meta.url),
        ),
      },
      {
        find: "turbowarp-unpackager",
        replacement: fileURLToPath(
          new URL("./built/turbowarp-unpackager/unpackager.js", import.meta.url),
        ),
      },
      { find: "built", replacement: fileURLToPath(new URL("./built", import.meta.url)) },
      {
        // mermaid's optional ELK layout is EPL-2.0, a copyleft licence: build without it
        find: /^elkjs\/lib\/elk\.bundled\.js$/,
        replacement: fileURLToPath(new URL("./src/handlers/mermaid/noElk.ts", import.meta.url)),
      },
      {
        // the package's own bundle is a webpack development build made of eval() calls, which
        // minifying breaks. Its TypeScript source is in the package too and builds cleanly.
        find: /^@websr\/websr$/,
        replacement: fileURLToPath(
          new URL("./node_modules/@websr/websr/src/main.ts", import.meta.url),
        ),
      },
    ],
  },
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: "built/espeakng.js/js/espeakng.worker.js",
          dest: "external/espeakng.js/",
        },
        {
          src: "built/espeakng.js/js/espeakng.worker.data",
          dest: "external/espeakng.js/",
        },
        {
          src: "node_modules/pdfjs-dist/{standard_fonts,cmaps,wasm}",
          dest: "external/pdfjs/",
        },
        {
          src: "built/typst-assets/files/fonts/*",
          dest: "external/typst/",
        },
        {
          // only the LSTM cores: the OCR handler never asks for the legacy engine
          src: [
            "node_modules/tesseract.js/dist/worker.min.js",
            "node_modules/tesseract.js-core/tesseract-core{,-simd,-relaxedsimd}-lstm.wasm.js",
            "node_modules/@tesseract.js-data/{eng,nld}/4.0.0_best_int/*.traineddata.gz",
          ],
          dest: "external/tesseract/",
        },
        {
          // loaded by "Check audio" with audioWorklet.addModule, which needs a file of its own
          src: "node_modules/loudness-worklet/packages/lib/dist/loudness.worklet.js",
          dest: "external/loudness/",
        },
        {
          src: "node_modules/@ffmpeg/core-mt/dist/esm/*",
          dest: "external/ffmpeg-mt/",
        },
        {
          // next to index.html, because a service worker only sees the pages below its own path
          src: "node_modules/coi-serviceworker/coi-serviceworker.min.js",
          dest: "./",
        },
      ],
    }),
    {
      // without the format cache, every dev page load initialises all handlers (about 270 MB)
      name: "serve-format-cache",
      configureServer(server) {
        server.middlewares.use("/cache.json", (_req, res, next) => {
          if (!existsSync("dist/cache.json")) return next();
          res.setHeader("Content-Type", "application/json");
          createReadStream("dist/cache.json").pipe(res);
        });
      },
    },
    {
      // Keeps the page to its own origin: a converted HTML, SVG or EPUB cannot load from or
      // send to the internet, and script that such a file brings along does not run. The
      // inline scripts of index.html are allowed by their hash. Build only, because the
      // development server adds inline scripts of its own. A <meta> policy covers the page,
      // not the converter worker, which draws nothing a file could script.
      name: "content-security-policy",
      apply: "build",
      transformIndexHtml: {
        order: "post",
        handler(html) {
          const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
            ([, code]) => `'sha256-${createHash("sha256").update(code).digest("base64")}'`,
          );
          const policy = [
            "default-src 'self' blob: data:",
            `script-src 'self' blob: 'wasm-unsafe-eval' ${hashes.join(" ")}`,
            "style-src 'self' 'unsafe-inline'",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'none'",
          ].join("; ");
          const charset = '<meta charset="UTF-8" />';
          if (!html.includes(charset)) throw new Error("index.html lost its charset tag");
          return html.replace(
            charset,
            `${charset}\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
          );
        },
      },
    },
    preact({
      prefreshEnabled: false,
      reactAliasesEnabled: true,
    }),
  ],
});
