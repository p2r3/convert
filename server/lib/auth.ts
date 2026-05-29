/**
 * API key auth + per-key token-bucket rate limiting.
 *
 * Configure via env:
 *   CONVERT_API_KEYS      comma-separated allowed keys (if empty: auth disabled)
 *   CONVERT_API_RATE_RPM  per-key requests per minute (default 60)
 *   CONVERT_API_BURST     burst size (default 20)
 */

import type { Request, Response, NextFunction } from "express";

const RPM = Number(process.env.CONVERT_API_RATE_RPM) || 60;
const BURST = Number(process.env.CONVERT_API_BURST) || 20;
const PER_SEC = RPM / 60;

const allowedKeys: Set<string> = new Set(
  (process.env.CONVERT_API_KEYS || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean),
);

interface Bucket {
  tokens: number;
  lastRefill: number;
}
const buckets = new Map<string, Bucket>();

function take(key: string): boolean {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b) {
    b = { tokens: BURST, lastRefill: now };
    buckets.set(key, b);
  }
  const elapsedSec = (now - b.lastRefill) / 1000;
  b.tokens = Math.min(BURST, b.tokens + elapsedSec * PER_SEC);
  b.lastRefill = now;
  if (b.tokens >= 1) {
    b.tokens -= 1;
    return true;
  }
  return false;
}

/** Periodically drop stale buckets to keep memory bounded. */
const sweep = setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [k, b] of buckets) if (b.lastRefill < cutoff) buckets.delete(k);
}, 5 * 60_000);
sweep.unref?.();

export function authEnabled(): boolean {
  return allowedKeys.size > 0;
}

export function authMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Always allow health + metrics + docs through (so probes work without keys).
    const openPaths = ["/health", "/metrics", "/openapi.json", "/openapi.yaml"];
    if (openPaths.includes(req.path) || req.path.startsWith("/docs")) return next();

    const key = (req.header("x-api-key") || "").trim();
    if (allowedKeys.size > 0) {
      if (!key) {
        res.status(401).json({ error: "Missing x-api-key header" });
        return;
      }
      if (!allowedKeys.has(key)) {
        res.status(403).json({ error: "Invalid API key" });
        return;
      }
    }
    // Rate-limit by key (or by remote address when auth is off).
    const bucketKey = key || (req.ip ?? req.socket?.remoteAddress ?? "anon");
    if (!take(bucketKey)) {
      res.setHeader("retry-after", "1");
      res.status(429).json({ error: "Rate limit exceeded", limit: `${RPM} req/min, burst ${BURST}` });
      return;
    }
    next();
  };
}
