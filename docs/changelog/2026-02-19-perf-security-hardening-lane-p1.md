# Lane P1 — Performance/Security hardening (Cloudflare edge control plane)

Date: 2026-02-19

## Scope covered

- Hardened Cloudflare Worker ops plane (`/_ops/*`) with strict method handling and safer response defaults.
- Added regression tests for Worker hardening behavior.
- Tightened critical integrity checks to include Worker + Wrangler deployment artifacts.

## Key changes

- `cloudflare/worker/index.mjs`
  - Added default security response headers for Worker-served responses.
  - Added `X-Robots-Tag: noindex, nofollow, noarchive` for ops JSON responses.
  - Restricted `/_ops/*` to `GET|HEAD`, returning `405` with `Allow` for other methods.
  - Added correlation-id sanitization + max length bound before structured logging.
  - Added explicit `404` JSON for unknown `/_ops/*` paths.
- `tests/cloudflareWorkerHardening.test.ts`
  - Added coverage for method restrictions, token auth, header defaults, HEAD behavior, and correlation-id sanitization.
- `scripts/check-critical-files.mjs`
  - Added `cloudflare/worker/index.mjs` and `wrangler.toml.example` to required deployment files.
  - Added Worker hardening token checks to prevent accidental rollback of security controls.
- Docs updated:
  - `docs/architecture/cloudflare-ops-endpoints.md`
  - `docs/ops/cloudflare-deploy-runbook.md`

## Notes

- No pSEO page content/templates were modified.
- No deploy credentials or secrets were added to the repository.
