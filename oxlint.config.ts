import { defineConfig } from "oxlint";
import { ignorePatterns } from "./oxfmt.config.ts";

export default defineConfig({
  ignorePatterns,
  options: { typeAware: true },
  categories: {
    correctness: "deny",
    suspicious: "deny",
  },
  rules: {
    "eslint/no-underscore-dangle": "allow",
    "eslint/no-shadow": "allow",
    "eslint/no-new": "allow",
    "no-unused-vars": [
      "warn",
      {
        varsIgnorePattern: "^_",
        argsIgnorePattern: "^_|^(inputFormat|outputFormat)$",
        fix: { imports: "safe-fix" },
      },
    ],
  },
});
