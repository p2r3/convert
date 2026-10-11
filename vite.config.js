import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import preact from "@preact/preset-vite";
import { fileURLToPath } from "node:url";
import { createReadStream, existsSync } from "node:fs";

export default defineConfig({
  publicDir: "public",
  optimizeDeps: {
    include: ["turbowarp-packager", "turbowarp-unpackager"],
    exclude: ["@ffmpeg/ffmpeg", "@sqlite.org/sqlite-wasm", "@bokuweb/zstd-wasm", "@yowasp/clang"],
  },
  base: "./",
  worker: {
    format: "es",
  },
  resolve: {
    tsconfigPaths: true,
    alias: {
      "turbowarp-packager": fileURLToPath(
        new URL("./built/turbowarp-packager/packager.js", import.meta.url),
      ),
      "turbowarp-unpackager": fileURLToPath(
        new URL("./built/turbowarp-unpackager/unpackager.js", import.meta.url),
      ),
      built: fileURLToPath(new URL("./built", import.meta.url)),
    },
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
    preact({
      prefreshEnabled: false,
      reactAliasesEnabled: true,
    }),
  ],
});
