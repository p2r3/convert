import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const PRIMARY_DOMAIN = "https://converttoit.com";

const errors = [];

function readFile(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  try {
    return fs.readFileSync(absolutePath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`${relativePath}: unable to read file (${message})`);
    return "";
  }
}

function assertFileExists(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    errors.push(`${relativePath}: file is missing`);
    return false;
  }
  const stat = fs.statSync(absolutePath);
  if (!stat.isFile()) {
    errors.push(`${relativePath}: expected a file`);
    return false;
  }
  if (stat.size === 0) {
    errors.push(`${relativePath}: file is empty`);
    return false;
  }
  return true;
}

const requiredFiles = [
  "index.html",
  "public/robots.txt",
  "public/sitemap.xml",
  "public/privacy.html",
  "public/terms.html",
  "public/format/index.html",
  "public/compare/index.html",
  "public/_headers",
  "public/_redirects",
  "public/seo/keyword-intent-map.json",
  "public/seo/anti-cannibalization-report.json",
  "public/seo/seo-rubric-report.json",
  "public/seo/domain-policy.json",
  "public/seo/url-patterns.json",
  "cloudflare/redirects/converttoit.app/_redirects",
  "cloudflare/worker/index.mjs",
  "wrangler.toml.example",
  "scripts/build-pseo.mjs",
  "scripts/check-cloudflare-asset-sizes.mjs",
  "scripts/validate-safe.sh"
];

for (const requiredFile of requiredFiles) {
  assertFileExists(requiredFile);
}

const robots = readFile("public/robots.txt");
for (const requiredLine of [
  "User-agent: *",
  "Allow: /",
  `Sitemap: ${PRIMARY_DOMAIN}/sitemap.xml`
]) {
  if (!robots.includes(requiredLine)) {
    errors.push(`public/robots.txt: missing line -> ${requiredLine}`);
  }
}

const sitemap = readFile("public/sitemap.xml");
if (!sitemap.includes("<urlset")) {
  errors.push("public/sitemap.xml: missing <urlset>");
}
const sitemapLocs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
if (sitemapLocs.length < 5) {
  errors.push(`public/sitemap.xml: expected at least 5 URLs, found ${sitemapLocs.length}`);
}
for (const mustInclude of [
  `${PRIMARY_DOMAIN}/`,
  `${PRIMARY_DOMAIN}/privacy.html`,
  `${PRIMARY_DOMAIN}/terms.html`,
  `${PRIMARY_DOMAIN}/format/`,
  `${PRIMARY_DOMAIN}/compare/`
]) {
  if (!sitemapLocs.includes(mustInclude)) {
    errors.push(`public/sitemap.xml: missing required URL ${mustInclude}`);
  }
}

const headers = readFile("public/_headers");
for (const requiredHeader of [
  "Strict-Transport-Security:",
  "Content-Security-Policy:",
  "X-Content-Type-Options: nosniff",
  "X-Frame-Options: DENY"
]) {
  if (!headers.includes(requiredHeader)) {
    errors.push(`public/_headers: missing required security header -> ${requiredHeader}`);
  }
}

const redirectRules = readFile("public/_redirects");
for (const requiredRedirect of [
  "/index.html / 301"
]) {
  if (!redirectRules.includes(requiredRedirect)) {
    errors.push(`public/_redirects: missing redirect rule -> ${requiredRedirect}`);
  }
}
for (const line of redirectRules.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
  if (/^https?:\/\//i.test(trimmed)) {
    errors.push(`public/_redirects: host-based redirects are not allowed for Workers assets -> ${trimmed}`);
  }
}

const edgeRedirectRules = readFile("cloudflare/redirects/converttoit.app/_redirects");
for (const requiredRedirect of [
  "https://converttoit.app/* https://converttoit.com/:splat 301!",
  "http://converttoit.app/* https://converttoit.com/:splat 301!",
  "https://www.converttoit.app/* https://converttoit.com/:splat 301!",
  "http://www.converttoit.app/* https://converttoit.com/:splat 301!"
]) {
  if (!edgeRedirectRules.includes(requiredRedirect)) {
    errors.push(`cloudflare/redirects/converttoit.app/_redirects: missing redirect rule -> ${requiredRedirect}`);
  }
}

const workerSource = readFile("cloudflare/worker/index.mjs");
for (const requiredWorkerToken of [
  "DEFAULT_SECURITY_HEADERS",
  "x-robots-tag",
  "OPS_ALLOWED_METHODS",
  "method_not_allowed",
  "MAX_CORRELATION_ID_LENGTH = 64",
  "CANONICAL_ORIGIN = \"https://converttoit.com\"",
  "\"converttoit.app\"",
  "Response.redirect(canonicalUrl.toString(), 301)"
]) {
  if (!workerSource.includes(requiredWorkerToken)) {
    errors.push(`cloudflare/worker/index.mjs: missing hardening token -> ${requiredWorkerToken}`);
  }
}

const keywordIntentMap = JSON.parse(readFile("public/seo/keyword-intent-map.json"));
if (keywordIntentMap.domain !== PRIMARY_DOMAIN) {
  errors.push(`public/seo/keyword-intent-map.json: domain must be ${PRIMARY_DOMAIN}`);
}
if (!Array.isArray(keywordIntentMap.entries) || keywordIntentMap.entries.length === 0) {
  errors.push("public/seo/keyword-intent-map.json: entries must be a non-empty array");
}

const antiCannibalization = JSON.parse(readFile("public/seo/anti-cannibalization-report.json"));
const uniquenessThreshold =
  antiCannibalization?.thresholds?.minMeaningfulUniquenessRaw ??
  antiCannibalization?.thresholds?.minMeaningfulUniqueness ??
  antiCannibalization?.threshold;
if (typeof uniquenessThreshold !== "number" || uniquenessThreshold < 0.5) {
  errors.push("public/seo/anti-cannibalization-report.json: minMeaningfulUniqueness threshold must be >= 0.5");
}
const strategyThreshold = antiCannibalization?.thresholds?.minMeaningfulUniquenessStrategyScore;
if (typeof strategyThreshold !== "number" || strategyThreshold < 80) {
  errors.push("public/seo/anti-cannibalization-report.json: minMeaningfulUniquenessStrategyScore threshold must be >= 80");
}
if (!Array.isArray(antiCannibalization.pageStats) || antiCannibalization.pageStats.length === 0) {
  errors.push("public/seo/anti-cannibalization-report.json: pageStats must be a non-empty array");
} else {
  const failingPages = antiCannibalization.pageStats.filter((entry) => entry.pass !== true);
  if (failingPages.length > 0) {
    errors.push(
      `public/seo/anti-cannibalization-report.json: found failing pages -> ${failingPages
        .map((entry) => entry.url)
        .join(", ")}`
    );
  }
  if (typeof strategyThreshold === "number") {
    const weakStrategyPages = antiCannibalization.pageStats
      .filter((entry) => typeof entry.meaningfulUniquenessStrategyScore !== "number" || entry.meaningfulUniquenessStrategyScore < strategyThreshold);
    if (weakStrategyPages.length > 0) {
      errors.push(
        `public/seo/anti-cannibalization-report.json: strategy score below ${strategyThreshold} -> ${weakStrategyPages
          .map((entry) => `${entry.url} (${entry.meaningfulUniquenessStrategyScore ?? "n/a"})`)
          .join(", ")}`
      );
    }
  }
}

const seoRubric = JSON.parse(readFile("public/seo/seo-rubric-report.json"));
if (typeof seoRubric?.targetMinimumScore !== "number") {
  errors.push("public/seo/seo-rubric-report.json: targetMinimumScore is missing");
}
if (typeof seoRubric?.summary?.minScore !== "number") {
  errors.push("public/seo/seo-rubric-report.json: summary.minScore is missing");
} else if (typeof seoRubric?.targetMinimumScore === "number" && seoRubric.summary.minScore < seoRubric.targetMinimumScore) {
  errors.push(
    `public/seo/seo-rubric-report.json: minScore (${seoRubric.summary.minScore}) is below targetMinimumScore (${seoRubric.targetMinimumScore})`
  );
}

const domainPolicy = JSON.parse(readFile("public/seo/domain-policy.json"));
if (domainPolicy?.canonicalDomain !== PRIMARY_DOMAIN) {
  errors.push(`public/seo/domain-policy.json: canonicalDomain must be ${PRIMARY_DOMAIN}`);
}
if (!Array.isArray(domainPolicy?.redirectSourceHosts) || domainPolicy.redirectSourceHosts.length < 4) {
  errors.push("public/seo/domain-policy.json: redirectSourceHosts must contain all legacy redirect host variants");
}

const urlPatterns = JSON.parse(readFile("public/seo/url-patterns.json"));
if (urlPatterns.domain !== PRIMARY_DOMAIN) {
  errors.push(`public/seo/url-patterns.json: domain must be ${PRIMARY_DOMAIN}`);
}
if (!urlPatterns.patterns || typeof urlPatterns.patterns !== "object") {
  errors.push("public/seo/url-patterns.json: patterns object is missing");
} else {
  if (urlPatterns.patterns.format !== "/format/{from}-to-{to}/") {
    errors.push("public/seo/url-patterns.json: unexpected format URL pattern");
  }
  if (urlPatterns.patterns.compare !== "/compare/{format-a}-vs-{format-b}/") {
    errors.push("public/seo/url-patterns.json: unexpected compare URL pattern");
  }
}

for (const legalPage of ["public/privacy.html", "public/terms.html"]) {
  const html = readFile(legalPage);
  if (!/<title>.+<\/title>/i.test(html)) {
    errors.push(`${legalPage}: missing <title>`);
  }
  if (!/<link[^>]*rel=["']canonical["']/i.test(html)) {
    errors.push(`${legalPage}: missing canonical link`);
  }
}

if (errors.length > 0) {
  console.error("Critical file integrity check failed:\n");
  for (const [index, error] of errors.entries()) {
    console.error(`${index + 1}. ${error}`);
  }
  process.exit(1);
}

console.log(`Critical file integrity check passed (${requiredFiles.length} required files, ${sitemapLocs.length} sitemap URLs).`);
