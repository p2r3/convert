import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  optimizeDeps: {
    exclude: [
      "@ffmpeg/ffmpeg",
      "@sqlite.org/sqlite-wasm",
      "@bokuweb/zstd-wasm"
    ]
  },
  base: "/convert/",
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: "node_modules/@flo-audio/reflo/reflo_bg.wasm",
          dest: "wasm"
        },
        {
          src: "src/handlers/pandoc/pandoc.wasm",
          dest: "wasm"
        },
        {
          src: "node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.*",
          dest: "wasm"
        },
        {
          src: "node_modules/@imagemagick/magick-wasm/dist/magick.wasm",
          dest: "wasm"
        },
        {
          src: "src/handlers/libopenmpt/libopenmpt.wasm",
          dest: "wasm"
        },
        {
          src: "src/handlers/libopenmpt/libopenmpt.js",
          dest: "wasm"
        },
        {
          src: "node_modules/js-synthesizer/externals/libfluidsynth-2.4.6.js",
          dest: "wasm"
        },
        {
          src: "node_modules/js-synthesizer/dist/js-synthesizer.js",
          dest: "wasm"
        },
        {
          src: "src/handlers/midi/TimGM6mb.sf2",
          dest: "wasm"
        },
        {
          src: "src/handlers/espeakng.js/js/espeakng.worker.js",
          dest: "js"
        },
        {
          src: "src/handlers/espeakng.js/js/espeakng.worker.data",
          dest: "js"
        },
        {
          src: "node_modules/pdf-parse/dist/pdf-parse/web/pdf.worker.mjs",
          dest: "js"
        },
        {
          src: "src/handlers/tarCompressed/liblzma.wasm",
          dest: "wasm"
        },
      ]
    }),
    tsconfigPaths()
  ]
});
