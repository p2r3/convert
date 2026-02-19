# 2026-02-19 — Cloudflare asset limit remediation

## Why

Live Cloudflare deploys were blocked by Workers static asset size limits:

- `dist/wasm/ffmpeg-core.wasm` exceeded 25 MiB (about 30.7 MiB).
- `dist/wasm/pandoc.wasm` exceeded 25 MiB (about 55.6 MiB).

## What changed

- FFmpeg runtime loading now defaults to CDN-hosted core assets (`@ffmpeg/core`) with optional local override via `VITE_FFMPEG_CORE_BASE_URL`.
- Pandoc runtime loading now defaults to remote wasm URL with optional override via `VITE_PANDOC_WASM_URL`.
- Removed local static copy of oversized `ffmpeg-core.*` and `pandoc.wasm` from `vite.config.js`.
- Added `scripts/check-cloudflare-asset-sizes.mjs` and package script `check:cf-assets`.
- Added deploy preflight guard in `scripts/deploy.sh` to fail fast on oversized assets.
- Included asset-size check in build-inclusive validation (`scripts/validate-safe.sh` when `VALIDATE_INCLUDE_BUILD=1`).
- Updated Worker/domain redirect handling to keep `public/_redirects` path-relative (Workers-compatible) while enforcing `.app -> .com` host redirect in Worker runtime and dedicated redirect matrix file.
- Improved `scripts/cf-log-check.sh` tail readiness handling (waits for active connection before pinging).
- Updated deployment docs and env example.

## Impact

- Cloudflare deploys now fail early with deterministic diagnostics if any asset exceeds Workers limits.
- The app avoids packaging oversized FFmpeg wasm by default while preserving configurable source control for FFmpeg core files.
