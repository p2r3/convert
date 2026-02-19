# 2026-02-19 — Production domain closure + post-deploy ops gate

## Scope

- Set `7and1/convert` as production primary repository baseline.
- Closed `converttoit.com` custom-domain routing chain on Cloudflare (DNS + Worker routes).
- Added automated post-deploy gate for `/_ops` and log-correlation verification.

## Code/CI changes

- Added `scripts/cf-post-deploy-gate.sh`.
- Added package script: `cf:post-gate`.
- Updated `.github/workflows/cloudflare-deploy.yml`:
  - run `scripts/cf-post-deploy-gate.sh` after production deploy.
- Updated `scripts/check-critical-files.mjs`:
  - enforce post-deploy gate presence and canonical-domain gate tokens.
- Updated `scripts/check-seo-domain-policy.mjs`:
  - enforce `www.converttoit.com` canonical redirect token.
- Updated `wrangler.toml.example`:
  - `run_worker_first = true` under `[assets]`.
- Updated runbooks:
  - `README.md`
  - `docs/ops/cloudflare-deploy-runbook.md`
  - `docs/ops/seo-pseo-production-rollout.md`

## Cloudflare production actions

- Zone: `converttoit.com` (active in target Cloudflare account)
- DNS (proxied):
  - `A/AAAA converttoit.com`
  - `A/AAAA www.converttoit.com`
- Worker routes:
  - `converttoit.com/* -> converttoit-site`
  - `www.converttoit.com/* -> converttoit-site`

## Validation highlights

- `bun run validate:ci` ✅
- `bun run check:seo-policy` ✅
- `bun run check:integrity` ✅
- `curl --resolve converttoit.com:443:172.67.147.116 https://converttoit.com/_ops/health` ✅
- `curl --resolve www.converttoit.com:443:172.67.147.116 https://www.converttoit.com/_ops/health` returns `301` to apex ✅

## Residual risks

- Current API token lacks permissions for some zone-level rule APIs (`9109 Unauthorized`), so advanced redirect-rule introspection is limited.
- `converttoit.app` zone is not currently available in this account; defensive-domain redirect closure for `.app` still requires zone onboarding or access delegation.
