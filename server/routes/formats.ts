import { Router } from "express";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

function loadCache(): typeof cached {
  if (cached) return cached;
  if (!existsSync(cachePath)) return null;
  try {
    const json = JSON.parse(readFileSync(cachePath, "utf8")) as Array<[string, CachedFormat[]]>;
    const flat: CachedFormat[] = [];
    for (const [, formats] of json) {
      for (const f of formats) flat.push(f);
    }
    cached = { handlers: json, flat };
    return cached;
  } catch {
    return null;
  }
}

/** A minimum hardcoded set of formats that the sharp + screenshot fast paths support, even if cache.json is missing. */
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

export const formatsRouter: Router = Router();

formatsRouter.get("/api/formats", (req, res) => {
  const cache = loadCache();
  const category = (req.query.category as string | undefined)?.toLowerCase();
  const direction = (req.query.direction as string | undefined)?.toLowerCase();

  const merged: CachedFormat[] = [...NATIVE_FORMATS];
  if (cache) {
    for (const f of cache.flat) {
      const key = `${f.mime}|${f.format}`;
      if (!merged.some((m) => `${m.mime}|${m.format}` === key)) merged.push(f);
    }
  }

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
    source: cache ? "cache+native" : "native",
    formats: filtered,
  });
});
