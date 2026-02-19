# Batch B / Lane 4 — QA/CI closure hardening for production handoff

Date: 2026-02-19
Owner: Lane 4 (validation/test/CI)

## Scope covered

- Reworked `scripts/validate-safe.sh` to run **actual available package scripts** and report missing required scripts clearly.
- Added deterministic automation for:
  - SEO/domain policy checks (`scripts/check-seo-domain-policy.mjs`)
  - Critical file integrity checks (`scripts/check-critical-files.mjs`)
- Added test wrappers so both checks are enforced in `bun test tests`:
  - `tests/seoDomainPolicy.test.ts`
  - `tests/criticalFileIntegrity.test.ts`
- Updated GitHub Pages workflow to split deterministic verification from deployment build:
  - `verify` job runs on `push` + `pull_request`
  - `build` + `deploy` run on `push` only
  - Bun version pinned to `1.3.3` for reproducibility

## New/updated commands

```bash
bun run validate:ci
bun run validate:safe
bun run check:seo-policy
bun run check:integrity
bun run test:unit
```

Optional (off by default in validate-safe):

```bash
VALIDATE_INCLUDE_BUILD=1 bun run validate:safe
VALIDATE_INCLUDE_BROWSER_TESTS=1 bun run validate:safe
```

## Residual risks

- Full browser conversion path coverage (`test/commonFormats.test.ts`) remains optional because it depends on Bun.serve + Puppeteer runtime behavior.
- Deployment build still depends on recursive submodule availability in CI (`build` job keeps `submodules: recursive`).
- Legacy `README.md` references to `convert.to.it` are intentionally not auto-blocked by these checks because this lane focuses on deployed SEO/domain artifacts.
