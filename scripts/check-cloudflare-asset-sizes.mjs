import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DIST_DIR = path.resolve(ROOT, process.env.CF_ASSET_DIR || "dist");
const MAX_ASSET_BYTES = Number(process.env.CF_MAX_ASSET_BYTES || (25 * 1024 * 1024));

if (!Number.isFinite(MAX_ASSET_BYTES) || MAX_ASSET_BYTES <= 0) {
  console.error(`Invalid CF_MAX_ASSET_BYTES: ${process.env.CF_MAX_ASSET_BYTES}`);
  process.exit(1);
}

if (!fs.existsSync(DIST_DIR) || !fs.statSync(DIST_DIR).isDirectory()) {
  console.error(`Asset directory does not exist: ${DIST_DIR}`);
  process.exit(1);
}

function toPosix(inputPath) {
  return inputPath.split(path.sep).join("/");
}

function collectFiles(dir) {
  const files = [];
  const stack = [dir];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      const size = fs.statSync(absolutePath).size;
      const relativePath = toPosix(path.relative(DIST_DIR, absolutePath));
      files.push({ absolutePath, relativePath, size });
    }
  }

  return files;
}

const files = collectFiles(DIST_DIR);
if (files.length === 0) {
  console.error(`No assets found under ${DIST_DIR}`);
  process.exit(1);
}

const oversized = files.filter((file) => file.size > MAX_ASSET_BYTES);
const sortedBySize = [...files].sort((a, b) => b.size - a.size);
const largest = sortedBySize[0];

if (oversized.length > 0) {
  console.error("Cloudflare asset size check failed:\n");
  console.error(`Max allowed size: ${(MAX_ASSET_BYTES / (1024 * 1024)).toFixed(2)} MiB`);
  for (const file of oversized) {
    console.error(
      `- ${file.relativePath}: ${(file.size / (1024 * 1024)).toFixed(2)} MiB (${file.size} bytes)`
    );
  }
  process.exit(1);
}

console.log(
  `Cloudflare asset size check passed (${files.length} files). Largest: ${largest.relativePath} (${(largest.size / (1024 * 1024)).toFixed(2)} MiB).`
);
