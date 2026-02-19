# Cloudflare ops endpoint strategy (minimal backend layer)

Last updated: 2026-02-19

## Goal

Keep the app primarily static while adding a minimal Cloudflare-native backend plane for operations.

## Strategy

- Use a single Worker as edge control-plane + static asset gateway.
- Serve static frontend from `dist/` via `env.ASSETS.fetch(request)`.
- Reserve `/_ops/*` for lightweight operational endpoints.
- Keep business conversion logic in the frontend (no server-side conversion added).

## Endpoint contract

| Endpoint | Method | Purpose | Auth |
|---|---|---|---|
| `/_ops/health` | GET | Liveness + deployment metadata | Public |
| `/_ops/version` | GET | Version/build visibility for support and incident triage | Public |
| `/_ops/log-ping` | GET | Emits structured log marker (`ops.log_ping`) for tail verification | Optional token via `OPS_LOG_TOKEN` |

## Logging model

`/_ops/log-ping` writes one structured JSON log line including:

- `event` (`ops.log_ping`)
- `timestamp`
- `requestId` (CF Ray or generated UUID)
- `correlationId` (user-provided or generated)
- `environment`

This enables deterministic deploy verification with `wrangler tail --search <correlationId>`.

## Security defaults

- No secrets hardcoded in repo.
- Optional secret gate for log marker endpoint (`OPS_LOG_TOKEN`).
- `/_ops/*` enforces `GET/HEAD` only (`405` otherwise).
- Ops responses include `X-Robots-Tag: noindex, nofollow, noarchive` + baseline security headers.
- User-provided correlation ids are sanitized and length-bounded before logging.
- Deployment token must come from environment (`CLOUDFLARE_API_TOKEN`).

## Why this fits current app direction

- Existing app is static/browser-heavy; this design avoids introducing heavyweight backend services.
- Adds only operational visibility surfaces needed for production support.
- Leaves room for future API growth under `/_ops/*` or `/api/*` without changing deployment platform.
- Large conversion wasm dependencies (FFmpeg core, Pandoc wasm) are loaded remotely by default to stay within Workers asset-size constraints.
- Canonical-domain redirects are enforced at the Worker layer (`.app`/`www` -> `.com`) to keep Workers asset `_redirects` compatible.
