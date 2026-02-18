import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  optimizeDeps: {
    exclude: [
      "@ffmpeg/ffmpeg",
      "@sqlite.org/sqlite-wasm",
    ],
    include: [
      "parse-sb3-blocks" // pre-bundle parse-sb3-blocks so it works in browser
    ]
  },
  resolve: {
    alias: {
      "parse-sb3-blocks": "parse-sb3-blocks/dist/parse-sb3-blocks.cjs"
    }
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
        }
      ]
    }),
    tsconfigPaths()
  ]
});
