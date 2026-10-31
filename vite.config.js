import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import preact from "@preact/preset-vite";
import legacy from "@vitejs/plugin-legacy";
import cssCompatibility from "./scripts/vite/css-compatibility.js";
import legacySyntax from "./scripts/vite/legacy-syntax.js";
import { fileURLToPath } from "node:url";

const isolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

const excludedHandlers = process.env.IS_DESKTOP === "true" ? ["clang"] : [];
const excludedHandlerFiles = excludedHandlers.map((name) =>
  fileURLToPath(new URL(`./src/handlers/${name}.ts`, import.meta.url)),
);

const excludeHandlers = {
  name: "exclude-handlers",
  enforce: "pre",
  load(id) {
    if (excludedHandlerFiles.includes(id)) return "export {};";
  },
};

export default defineConfig({
  define: { __EXCLUDED_HANDLERS__: JSON.stringify(excludedHandlers) },
  server: { headers: isolationHeaders, watch: { ignored: ["**/.cache/**"] } },
  preview: { headers: isolationHeaders },
  publicDir: "public",
  build: { cssTarget: ["chrome49", "firefox52", "safari10"] },
  optimizeDeps: {
    include: ["turbowarp-packager", "turbowarp-unpackager"],
    exclude: ["@sqlite.org/sqlite-wasm", "@bokuweb/zstd-wasm"],
  },
  base: "./",
  css: { postcss: { plugins: [cssCompatibility()] } },
  worker: {
    format: "es",
    plugins: () => [excludeHandlers],
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
    excludeHandlers,
    legacySyntax(),
    legacy({
      targets: ["Chrome >= 49", "Firefox >= 52", "Safari >= 10", "iOS >= 10"],
      modernTargets: ["Chrome >= 111", "Edge >= 111", "Firefox >= 114", "Safari >= 16.4"],
      // The app already imports core-js in both builds.
      polyfills: false,
      additionalLegacyPolyfills: [
        fileURLToPath(new URL("./src/legacy-polyfills.ts", import.meta.url)),
      ],
    }),
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
      ],
    }),
    preact({
      prefreshEnabled: false,
      reactAliasesEnabled: true,
    }),
  ],
});
