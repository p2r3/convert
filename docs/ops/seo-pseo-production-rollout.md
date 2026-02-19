# SEO + pSEO production rollout runbook (converttoit.com)

Last updated: 2026-02-19

## 1) Scope

This runbook defines the production rollout flow for:

- SEO migration hardening (`converttoit.app` -> `converttoit.com`)
- pSEO batch generation + quality control
- Cloudflare deploy and log validation gates

Use this with:

- `docs/ops/cloudflare-deploy-runbook.md`
- `docs/architecture/cloudflare-ops-endpoints.md`

## 2) Parallel workflow and phase gates

### Lane A — SEO migration + indexing

1. Verify canonical/robots/sitemap use `https://converttoit.com`.
2. Confirm 301 path-preserving redirects from `.app` to `.com`.
3. Submit sitemap + migration controls in Search Console and Bing.

### Lane B — pSEO batch rollout

1. Build pSEO artifacts with deterministic scripts.
2. Validate template uniqueness and internal-link hubs.
3. Launch small batch first, then scale winners only.

### Shared gate (must pass before promotion)

- Deploy preflight checks pass.
- Production deploy succeeds.
- `_ops/health`, `_ops/version`, and log-correlation check pass.

## 3) Command-ready rollout steps

### 3.1 Pre-deploy setup

```bash
cp .env.local.example .env.local
source .env.local
```

### 3.2 Build + quality gates

```bash
bun run pseo:build
bun run check:seo-policy
bun run check:integrity
bun run validate:safe
bun run check:cf-assets
```

### 3.3 Deploy gates

```bash
bun run cf:deploy:dry-run
bun run cf:deploy
```

### 3.4 Post-deploy validation gates

```bash
curl -fsS https://converttoit.com/_ops/health | jq
curl -fsS https://converttoit.com/_ops/version | jq
CF_DEPLOY_BASE_URL="https://converttoit.com" bun run cf:logs:check
```

### 3.5 Rollback trigger

Rollback if any gate above fails, or if redirect success drops below threshold:

```bash
bash scripts/cf-rollback.sh production --yes
```

## 4) KPI targets and alerts (first 45 days)

| KPI | Target | Alert threshold | Source |
|---|---:|---:|---|
| Valid indexed pages (`.com`) | +20-40% | >10% WoW drop | GSC + Bing |
| Non-brand organic clicks | +10-20% | >15% drop / 7d | GSC |
| Avg CTR (core pages) | +0.5 to +1.5 pp | -0.7 pp vs baseline | GSC |
| Redirect success rate (`.app` -> `.com`) | >99.5% | <99.0% | Edge logs |
| pSEO indexation rate | >70% by day 45 | <50% by day 30 | GSC/Bing + sitemap cohorts |
| Cannibalization incidents | <=5 high-impact | >10 conflicts | Query/page overlap audit |

## 5) Domain migration checklist (`.app` -> `.com`)

- [ ] `converttoit.app` ownership + DNS + TLS verified.
- [ ] `.app` -> `.com` redirect is direct 301 (no chains).
- [ ] Canonical/OG/Twitter/sitemap/robots all point to `.com`.
- [ ] Search Console Domain properties verified for both domains.
- [ ] Bing Webmaster properties verified for both domains.
- [ ] `https://converttoit.com/sitemap.xml` submitted in both tools.
- [ ] Change of Address submitted when prerequisites are met.
- [ ] Redirects retained >= 12 months with weekly audits.

## 6) Deployment/log validation evidence template

Capture and attach these in each production release note:

1. `bun run cf:deploy:dry-run` output (`SUCCESS` gate).
2. `bun run cf:deploy` output (deployed version id).
3. `/_ops/health` JSON snapshot (timestamp + environment).
4. `/_ops/version` JSON snapshot (version + commit metadata).
5. `bun run cf:logs:check` output containing:
   - generated correlation id
   - `SUCCESS: correlation id found in Cloudflare tail output.`

## 7) Residual risks and follow-ups

1. **Legacy references still visible externally**
   - Follow-up: monthly backlink/profile update sweep.
2. **pSEO thin-content or cannibalization drift**
   - Follow-up: weekly template-cohort pruning and uniqueness checks.
3. **Migration dependency on `.app` operational status**
   - Follow-up: registrar + DNS audit before each major rollout wave.
