import { Router } from "express";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { formatTracker, type TrackedFormat } from "../lib/formatTracker.ts";
import { badRequest, notFound } from "../lib/errors.ts";

const __filename = fileURLToPath(import.meta.url);
const cachePath = resolve(__filename, "../../../dist/cache.json");

interface CachedFormat {
  name: string;
  format: string;
  extension: string;
  mime: string;
  from: boolean;
  to: boolean;
  category?: string | string[];
  lossless?: boolean;
}

let cached: { handlers: Array<[string, CachedFormat[]]>; flat: CachedFormat[] } | null = null;
let cacheLoadedMtime: number | null = null;

function loadCache(): typeof cached {
  if (!existsSync(cachePath)) return null;
  try {
    const json = JSON.parse(readFileSync(cachePath, "utf8")) as Array<[string, CachedFormat[]]>;
    const flat: CachedFormat[] = [];
    for (const [, formats] of json) {
      for (const f of formats) flat.push(f);
    }
    cached = { handlers: json, flat };
    cacheLoadedMtime = Date.now();
    return cached;
  } catch {
    return null;
  }
}

const NATIVE_FORMATS: CachedFormat[] = [
  { name: "Portable Network Graphics", format: "png", extension: "png", mime: "image/png", from: true, to: true, category: "image", lossless: true },
  { name: "JPEG", format: "jpeg", extension: "jpg", mime: "image/jpeg", from: true, to: true, category: "image" },
  { name: "WebP", format: "webp", extension: "webp", mime: "image/webp", from: true, to: true, category: "image" },
  { name: "AVIF", format: "avif", extension: "avif", mime: "image/avif", from: true, to: true, category: "image" },
  { name: "TIFF", format: "tiff", extension: "tiff", mime: "image/tiff", from: true, to: true, category: "image" },
  { name: "GIF", format: "gif", extension: "gif", mime: "image/gif", from: true, to: true, category: "image" },
  { name: "HEIF/HEIC", format: "heif", extension: "heic", mime: "image/heif", from: true, to: true, category: "image" },
  { name: "Portable Document Format (screenshot only)", format: "pdf", extension: "pdf", mime: "application/pdf", from: false, to: true, category: "document" },
  { name: "Webpage (screenshot input)", format: "html", extension: "html", mime: "text/html", from: true, to: false, category: "web" },
];

function mergedFormats(): CachedFormat[] {
  const cache = loadCache();
  const merged: CachedFormat[] = [...NATIVE_FORMATS];
  if (cache) {
    for (const f of cache.flat) {
      const key = `${f.mime}|${f.format}`;
      if (!merged.some((m) => `${m.mime}|${m.format}` === key)) merged.push(f);
    }
  }
  return merged;
}

/** Snapshot the current format list and emit diffs. Called on every /api/formats hit. */
async function reconcileIfNeeded(): Promise<void> {
  const merged = mergedFormats();
  const tracked: TrackedFormat[] = merged.map((f) => ({
    format: f.format,
    mime: f.mime,
    name: f.name,
    extension: f.extension,
    category: f.category,
    from: f.from,
    to: f.to,
  }));
  await formatTracker.reconcile(tracked);
}

void formatTracker.load();

export const formatsRouter: Router = Router();

formatsRouter.get("/api/formats", async (req, res) => {
  await reconcileIfNeeded();
  const merged = mergedFormats();
  const category = (req.query.category as string | undefined)?.toLowerCase();
  const direction = (req.query.direction as string | undefined)?.toLowerCase();

  const filtered = merged.filter((f) => {
    if (category) {
      const cats = Array.isArray(f.category) ? f.category : f.category ? [f.category] : [];
      if (!cats.some((c) => c.toLowerCase() === category)) return false;
    }
    if (direction === "from" && !f.from) return false;
    if (direction === "to" && !f.to) return false;
    return true;
  });

  res.json({
    count: filtered.length,
    source: cached ? "cache+native" : "native",
    cacheLoadedAt: cacheLoadedMtime,
    formats: filtered,
  });
});

export const formatsUpdateRouter: Router = Router();

/** Recent format changes (additions/removals). */
formatsUpdateRouter.get("/api/formats/changes", async (req, res) => {
  await reconcileIfNeeded();
  const limit = Number(req.query.limit) || 50;
  res.json({ changes: formatTracker.recentChanges(Math.max(1, Math.min(500, limit))) });
});

/** Server-Sent Events stream of new format additions/removals. */
formatsUpdateRouter.get("/api/formats/stream", (req, res) => {
  res.setHeader("content-type", "text/event-stream");
  res.setHeader("cache-control", "no-cache");
  res.setHeader("connection", "keep-alive");
  res.flushHeaders?.();
  const send = (ev: string, data: unknown) => {
    res.write(`event: ${ev}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  send("hello", { ok: true, recent: formatTracker.recentChanges(20) });
  const onChange = (ch: unknown) => send("change", ch);
  formatTracker.on("change", onChange);
  const ka = setInterval(() => res.write(`: keep-alive\n\n`), 25_000);
  ka.unref?.();
  req.on("close", () => {
    formatTracker.off("change", onChange);
    clearInterval(ka);
  });
});

/** Register a webhook for format-update events. */
formatsUpdateRouter.post("/api/subscriptions/formats", async (req, res) => {
  const body = (req.body || {}) as { url?: string; secret?: string; events?: string[] };
  const url = typeof body.url === "string" ? body.url : "";
  if (!url) throw badRequest("Missing url");
  try {
    new URL(url);
  } catch {
    throw badRequest("Invalid url");
  }
  const events = (body.events || []).filter((e) => e === "added" || e === "removed") as Array<"added" | "removed">;
  await formatTracker.load();
  const sub = formatTracker.subscribe({ url, secret: body.secret, events });
  res.status(201).json({ id: sub.id, url: sub.url, events: sub.events, createdAt: sub.createdAt });
});

formatsUpdateRouter.get("/api/subscriptions/formats", async (_req, res) => {
  await formatTracker.load();
  res.json({ subscriptions: formatTracker.listSubscriptions() });
});

formatsUpdateRouter.delete("/api/subscriptions/formats/:id", async (req, res) => {
  await formatTracker.load();
  const ok = formatTracker.unsubscribe(req.params.id);
  if (!ok) throw notFound(`Subscription ${req.params.id} not found`);
  res.json({ ok: true });
});
