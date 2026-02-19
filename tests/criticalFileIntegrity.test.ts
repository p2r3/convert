import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import path from "node:path";

const ROOT_DIR = path.resolve(import.meta.dir, "..");

test("should pass critical file integrity checks", () => {
  const result = spawnSync("node", ["scripts/check-critical-files.mjs"], {
    cwd: ROOT_DIR,
    encoding: "utf8"
  });

  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
  }

  expect(result.status).toBe(0);
});
