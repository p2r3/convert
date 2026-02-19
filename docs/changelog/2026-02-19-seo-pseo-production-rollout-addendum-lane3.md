# Batch B / Lane 3 — SEO+pSEO production rollout addendum

Date: 2026-02-19  
Owner: Lane 3 (docs/changelog/update notes)

## Scope covered

- Added a dedicated production runbook for parallel SEO + pSEO rollout.
- Added command-ready deploy/log validation gates for release notes.
- Updated README deployment guidance with the recommended release gate sequence.

## Files updated

- `docs/ops/seo-pseo-production-rollout.md` (new)
- `README.md` (Cloudflare deployment section)

## Production rollout checklist highlights

- Parallel lanes documented: SEO migration controls + pSEO batch controls.
- KPI targets and alert thresholds documented for first 45 days.
- `.app -> .com` migration checklist consolidated for pre/post cutover.
- Deploy/log validation evidence template added for release handoff.

## Validation commands executed

```bash
bun run check:seo-policy
bun run check:integrity
bun run validate:safe
```

Result: all commands passed in this documentation lane.

## Residual risks

1. `.app` ownership/operational status must stay verified for migration continuity.
2. pSEO scaling can still create thin/cannibalized cohorts without weekly pruning.
3. External legacy references (`convert.to.it`) can continue to leak branded traffic.

## Follow-ups

- Add release artifacts (dry-run/deploy/log-check outputs) to each production cut.
- Track KPI dashboard weekly; trigger rollback/reduction playbooks on alert thresholds.
