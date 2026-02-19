# Batch B / Lane 3 — SEO + pSEO rollout docs for converttoit.com

Date: 2026-02-19
Owner: Lane 3 (docs/changelog only)

## 1) Scope covered

- Created rollout/update notes for a **parallel SEO + pSEO workflow**.
- Added a **.app -> .com domain migration checklist**.
- Added **Google Search Console + Bing Webmaster property/sitemap submission checklists**.
- Added **residual risks + follow-up actions**.
- Constraint honored: no implementation files changed in this lane.

## 2) Current-state evidence snapshot (before rollout)

- Upstream project remains `p2r3/convert` on default branch `master`.
- Upstream README messaging still references `convert.to.it`.
- Current repo SEO files already reference `https://converttoit.com/`:
  - `index.html` canonical/OG/Twitter URLs
  - `public/sitemap.xml`
  - `public/robots.txt`
- Redirect artifact exists: `cloudflare/redirects/converttoit.app/_redirects` with a 301 to `https://converttoit.com/:splat`.
- RDAP lookup endpoint used for `converttoit.app` returned **HTTP 404 + empty response**, so registry/ownership status is not confirmed from that endpoint alone.
- Automated fetch of Google SERP (`"converttoit.app"`) hit anti-bot/JS interstitial, so manual browser verification is required.

## 3) Parallel rollout plan (SEO lane + pSEO lane)

## Phase 0 — Baseline (Day 0)

- SEO lane:
  - Export baseline from Search Console (clicks, impressions, CTR, avg position) for last 28 days.
  - Export Bing baseline for clicks/impressions/indexed pages.
  - Crawl `converttoit.com` and record canonical/robots/sitemap health.
- pSEO lane:
  - Freeze initial pSEO URL taxonomy and template contract.
  - Define uniqueness QA rules (>80% unique body copy per template cohort).
  - Define internal-link hub model (hub -> cluster and cluster -> hub).

## Phase 1 — Migration + indexing controls (Days 1-3)

- SEO lane:
  - Verify both domains in Search Console and Bing (`converttoit.app`, `converttoit.com`).
  - Confirm path-preserving 301 redirects from old host to new host.
  - Submit `https://converttoit.com/sitemap.xml` in both webmaster tools.
  - If old domain is active and verified, submit Google Change of Address request.
- pSEO lane:
  - Launch first controlled batch of template pages (small cohort).
  - Validate canonical self-reference + inclusion in XML sitemap.
  - Add internal links from homepage/utility hubs to new pSEO cluster pages.

## Phase 2 — Scale tests (Days 4-14)

- SEO lane:
  - Monitor index coverage, crawl anomalies, redirect errors.
  - Refresh sitemap on each content batch release.
- pSEO lane:
  - Expand only winning templates (CTR and indexation healthy).
  - Run one-variable tests only (title/meta/template block order).
  - Kill or merge thin/cannibalized pages quickly.

## Phase 3 — Stabilization (Days 15-45)

- SEO lane:
  - Compare 28-day post baseline vs pre-baseline.
  - Keep 301s active and monitored for at least 12 months.
- pSEO lane:
  - Scale proven page types and pause underperformers.
  - Add FAQ/schema where eligible and track snippet lift.

## 4) KPI framework

Track weekly (and daily for first 14 days post-migration):

| KPI | Baseline source | Target (first 45 days) | Alert threshold |
|---|---|---:|---:|
| Valid indexed pages (`.com`) | GSC + Bing indexed pages | +20-40% (controlled growth) | >10% week-over-week drop |
| Non-brand organic clicks | GSC query filter | +10-20% | >15% drop over 7 days |
| Avg CTR (core pages) | GSC page-level CTR | +0.5 to +1.5 pp | -0.7 pp vs baseline |
| Redirect success rate (`.app -> .com`) | Edge logs | >99.5% 301 success | <99.0% |
| 404/soft-404 on migrated paths | GSC Pages report | <1% of crawled URLs | >3% |
| pSEO indexation rate | (Indexed pSEO URLs / submitted pSEO URLs) | >70% by day 45 | <50% by day 30 |
| Cannibalization incidents | Query/page overlap audit | <=5 high-impact conflicts | >10 conflicts |

## 5) `.app -> .com` migration checklist

## A. Domain + infra

- [ ] Confirm `converttoit.app` ownership/status with registrar (RDAP endpoint used in this lane returned 404).
- [ ] Ensure TLS certificate coverage for both hosts.
- [ ] Ensure DNS points old host to redirect edge.

## B. Redirect + canonical integrity

- [ ] 301 map old -> new with path and query preservation.
- [ ] No redirect chains (`.app -> .com` directly).
- [ ] Canonical, OG URL, Twitter URL all use `.com` only.
- [ ] Sitemap and robots reference `.com` URLs only.

## C. Search engine migration controls

- [ ] Verify both domains in Search Console.
- [ ] Submit Change of Address in Search Console (only if old domain is verified + 301s fully live).
- [ ] Verify both domains in Bing Webmaster Tools.
- [ ] Submit `.com` sitemap in both tools.

## D. Post-cutover hygiene

- [ ] Update top backlinks/owned profiles to `.com`.
- [ ] Keep redirects live >= 12 months.
- [ ] Weekly redirect log audit for orphan `.app` URLs.

## 6) Search Console + Bing submission checklists

## Google Search Console

- [ ] Add **Domain property** for `converttoit.com`.
- [ ] Add **Domain property** for `converttoit.app` (for migration continuity).
- [ ] Verify via DNS TXT records.
- [ ] Submit `https://converttoit.com/sitemap.xml` in Sitemaps.
- [ ] Confirm sitemap `Success` and monitor indexing in Pages report.
- [ ] Use Change of Address tool when prerequisites are met.

## Bing Webmaster Tools

- [ ] Add site for `https://converttoit.com/`.
- [ ] Add site for legacy `https://converttoit.app/` if active.
- [ ] Complete site verification (recommended: DNS-based).
- [ ] Submit `https://converttoit.com/sitemap.xml`.
- [ ] Re-submit sitemap after each major pSEO batch release.
- [ ] Monitor crawl/index/URL inspection for template cohorts.

## 7) Changelog / update notes

- **2026-02-19 (Batch B, Lane 3)**
  - Added rollout documentation for parallel SEO+pSEO execution.
  - Added migration checklist for `.app -> .com` cutover hardening.
  - Added Search Console/Bing setup + sitemap submission checklist.
  - Added KPI table and operational alert thresholds.
  - Added residual risk register and follow-up actions.

## 8) Residual risks and follow-up actions

## Risk R1 — `converttoit.app` status unresolved

- Evidence: RDAP endpoint queried in this lane returned HTTP 404.
- Impact: migration plan assumptions may fail if domain is not owned/active.
- Follow-up (by **2026-02-21**): verify registrar account ownership, nameservers, and renewal status.

## Risk R2 — SERP verification incomplete from automation

- Evidence: direct Google query response returned anti-bot JS interstitial.
- Impact: cannot trust automated SERP snapshot for current `.app` index footprint.
- Follow-up (by **2026-02-20**): run manual browser checks for `"converttoit.app"` and capture screenshots of indexed URLs.

## Risk R3 — legacy mentions may persist externally

- Evidence: upstream README and historical references still point to `convert.to.it`.
- Impact: residual traffic leakage and brand/entity ambiguity.
- Follow-up (by **2026-02-26**): maintain outreach list and update top referring profiles/pages.

## Risk R4 — pSEO scale can trigger thin/cannibalized pages

- Impact: index bloat, ranking dilution, crawl waste.
- Follow-up (weekly): enforce uniqueness threshold and merge/remove low-value cohorts.

## 9) Sources

Required context sources:
- https://github.com/p2r3/convert
- https://raw.githubusercontent.com/p2r3/convert/master/README.md
- https://pubapi.registry.google/rdap/domain/converttoit.app
- https://www.google.com/search?q=%22converttoit.app%22

Additional operational references:
- Google Search Central — Site move with URL changes: https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes
- Google Search Console Help — Add and verify ownership: https://support.google.com/webmasters/answer/34592
- Google Search Console Help — Domain property verification: https://support.google.com/webmasters/answer/9008080
- Google Search Console Help — Change of Address tool: https://support.google.com/webmasters/answer/9370220
- Bing Webmaster Blog — How to submit sitemaps in Bing Webmaster Tools: https://blogs.bing.com/webmaster/august-2017/How-to-Submit-Sitemaps-in-Bing-Webmaster-Tools
- Bing Webmaster Blog — How to Add and Verify your Website in Bing Webmaster Tools: https://blogs.bing.com/webmaster/november-2020/How-to-Add-and-Verify-your-Website-in-Bing-Webmaster-Tools
