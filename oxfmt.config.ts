import { defineConfig } from "oxfmt";

export const ignorePatterns = [
  ".github/**",
  "built/**",
  "src/handlers/index.ts",
  "test/resources/**",
  "src/handlers/azw3/**",
  "src/handlers/libopenmpt/**",
  "src/handlers/midi/**",
  "src/handlers/pandoc/**",
];

export default defineConfig({ ignorePatterns });
