import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import preact from "@preact/preset-vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  publicDir: "public",
  optimizeDeps: {
    exclude: ["@ffmpeg/ffmpeg", "@sqlite.org/sqlite-wasm", "@bokuweb/zstd-wasm", "@yowasp/clang"],
  },
  base: "/convert/",
  worker: {
    format: "es",
  },
  resolve: {
    tsconfigPaths: true,
    alias: {
      built: fileURLToPath(new URL("./built", import.meta.url)),
    },
  },
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: "node_modules/@flo-audio/reflo/reflo_bg.wasm",
          dest: "wasm",
        },
        {
          src: "src/handlers/pandoc/pandoc.wasm",
          dest: "wasm",
        },
        {
          src: "node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.*",
          dest: "wasm",
        },
        {
          src: "node_modules/@imagemagick/magick-wasm/dist/magick.wasm",
          dest: "wasm",
        },
        {
          src: "src/handlers/libopenmpt/libopenmpt.wasm",
          dest: "wasm",
        },
        {
          src: "src/handlers/libopenmpt/libopenmpt.js",
          dest: "wasm",
        },
        {
          src: "node_modules/js-synthesizer/externals/libfluidsynth-2.4.6.js",
          dest: "wasm",
        },
        {
          src: "node_modules/js-synthesizer/dist/js-synthesizer.js",
          dest: "wasm",
        },
        {
          src: "src/handlers/midi/TimGM6mb.sf2",
          dest: "wasm",
        },
        {
          src: "built/espeakng.js/js/espeakng.worker.js",
          dest: "js",
        },
        {
          src: "built/espeakng.js/js/espeakng.worker.data",
          dest: "js",
        },
        {
          src: "node_modules/pdfjs-dist/{standard_fonts,cmaps,wasm}",
          dest: "js/pdfjs",
        },
        {
          src: "node_modules/pdf-parse/dist/pdf-parse/web/pdf.worker.mjs",
          dest: "js",
        },
        {
          src: "node_modules/turbowarp-packager-browser/dist/scaffolding/*",
          dest: "js/turbowarp-scaffolding",
        },
        {
          src: "node_modules/7z-wasm/7zz.wasm",
          dest: "wasm",
        },
        {
          src: "node_modules/@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm",
          dest: "wasm",
        },
        {
          src: "node_modules/@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm",
          dest: "wasm",
        },
        {
          src: "built/typst-assets/files/fonts/*",
          dest: "wasm/typst",
        },
      ],
    }),
    preact({
      prefreshEnabled: false,
      reactAliasesEnabled: true,
    }),
  ],
});
