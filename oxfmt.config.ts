import { defineConfig } from "oxfmt";

export const ignorePatterns = [
  ".github/**",
  "built/**",
  "src/handlers/index.ts",
  "src/ui/popularity.json",
  "test/resources/**",
];

export default defineConfig({ ignorePatterns });
