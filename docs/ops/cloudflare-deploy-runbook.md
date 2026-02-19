# Cloudflare production deploy runbook (Workers + static assets)

Last updated: 2026-02-19

## 1) What is deployed

- Static frontend assets: `dist/` (built by Vite)
- Edge Worker entrypoint: `cloudflare/worker/index.mjs`
- Wrangler config template: `wrangler.toml.example` (committed)
- Wrangler runtime config: `wrangler.toml` (gitignored)
- Ops endpoints:
  - `GET|HEAD /_ops/health`
  - `GET|HEAD /_ops/version`
  - `GET|HEAD /_ops/log-ping` (optionally protected by `OPS_LOG_TOKEN`)

## 2) One-time prerequisites

```bash
# In repo root
cp .env.local.example .env.local
cp wrangler.toml.example wrangler.toml
# Edit .env.local with real values, then load it:
source .env.local
```

Required for non-interactive deploy:

- `CLOUDFLARE_API_TOKEN`

Recommended:

- `CLOUDFLARE_ACCOUNT_ID`

Optional (ops hardening):

- `CF_OPS_LOG_TOKEN`

Use request header authentication for log ping checks:

- `x-ops-token: <token>`

Set the Worker secret when you use `CF_OPS_LOG_TOKEN`:

```bash
echo -n "$CF_OPS_LOG_TOKEN" | bunx --bun wrangler@4 secret put OPS_LOG_TOKEN --config wrangler.toml
```

For staging:

```bash
echo -n "$CF_OPS_LOG_TOKEN" | bunx --bun wrangler@4 secret put OPS_LOG_TOKEN --config wrangler.toml --env staging
```

## 3) Deploy

Domain policy guardrails (enforced in `scripts/deploy.sh` by default):

- Canonical domain is `https://converttoit.com` only.
- `converttoit.app` is redirect-only and must not be used as canonical/sitemap/hreflang/internal-link target.
- Keep host-level redirect matrix in `cloudflare/redirects/converttoit.app/_redirects` (or equivalent zone rules).
- Keep `public/_redirects` path-relative only (Workers assets reject host-based rules).
- Preflight checks run automatically:
  - `node scripts/check-seo-domain-policy.mjs`
  - `node scripts/check-critical-files.mjs`
  - `node scripts/check-cloudflare-asset-sizes.mjs`

Dry run (build + bundle verification):

```bash
bash scripts/deploy.sh production --dry-run
```

Production deploy:

```bash
bash scripts/deploy.sh production
```

Staging deploy:

```bash
bash scripts/deploy.sh staging
```

Emergency bypass (not recommended):

```bash
bash scripts/deploy.sh production --skip-policy-checks
```

## 4) Post-deploy verification

Check health/version quickly:

```bash
curl -fsS https://<your-worker-url>/_ops/health | jq
curl -fsS https://<your-worker-url>/_ops/version | jq
```

Verify logs end-to-end with correlation id:

```bash
CF_DEPLOY_BASE_URL="https://<your-worker-url>" \
CF_OPS_LOG_TOKEN="${CF_OPS_LOG_TOKEN:-}" \
bash scripts/cf-log-check.sh production
```

Notes:

- `--base-url` must be `https://...`.
- `converttoit.app` is blocked for `--base-url` (redirect-only domain).

Expected result:

- Script prints a JSON response from `/_ops/log-ping`
- Script ends with `SUCCESS: correlation id found in Cloudflare tail output.`

## 5) Rollback

Rollback to previous version:

```bash
bash scripts/cf-rollback.sh production --yes
```

Rollback to a specific version id:

```bash
# List versions first
bunx --bun wrangler@4 versions list --config wrangler.toml

# Then rollback
bash scripts/cf-rollback.sh production <version-id> --yes
```

Staging rollback:

```bash
bash scripts/cf-rollback.sh staging
```

List deployable versions before rollback:

```bash
bash scripts/cf-rollback.sh production --list
```

Tip: `--yes` is recommended for explicit/non-interactive production rollback flows.

## 6) Troubleshooting

- `CLOUDFLARE_API_TOKEN is not set`
  - Export token, or set `CF_ALLOW_INTERACTIVE=1` for local authenticated wrangler sessions.
- `ASSETS binding is not configured`
  - Ensure deploy was run with `wrangler.toml` and static assets were built into `dist/`.
- `Asset too large`
  - Workers static assets have a hard 25 MiB per-file limit.
  - This project loads FFmpeg core and Pandoc wasm from remote URLs by default to avoid bundling oversized wasm in `dist/`.
  - You can override sources with `VITE_FFMPEG_CORE_BASE_URL` and `VITE_PANDOC_WASM_URL` during build if needed.
- Log-check cannot find correlation id
  - Verify correct `--base-url` and environment (`production` vs `staging`), then retry.
