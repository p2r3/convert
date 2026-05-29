import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, stat, unlink, readdir } from "node:fs/promises";
import { join } from "node:path";
import { log } from "./log.ts";

export interface CacheEntry {
  bytes: Uint8Array;
  contentType: string;
  fileName: string;
  storedAt: number;
}

const CACHE_DIR = process.env.CONVERT_API_CACHE_DIR || "/tmp/convert-api-cache";
const MAX_BYTES = Number(process.env.CONVERT_API_CACHE_MAX_BYTES) || 512 * 1024 * 1024; // 512MB
const MAX_AGE_MS = Number(process.env.CONVERT_API_CACHE_MAX_AGE_MS) || 24 * 60 * 60 * 1000; // 24h

class ResultCache {
  private mem = new Map<string, CacheEntry>();
  private memBytes = 0;
  private enabled = process.env.CONVERT_API_CACHE_DISABLED !== "1";

  /** Build a deterministic key from operation kind + arbitrary params. */
  key(kind: string, params: Record<string, unknown>): string {
    const ordered: Record<string, unknown> = {};
    for (const k of Object.keys(params).sort()) {
      if (params[k] !== undefined) ordered[k] = params[k];
    }
    return createHash("sha256")
      .update(kind)
      .update("|")
      .update(JSON.stringify(ordered))
      .digest("hex");
  }

  async get(key: string): Promise<CacheEntry | null> {
    if (!this.enabled) return null;
    const m = this.mem.get(key);
    if (m) {
      if (Date.now() - m.storedAt < MAX_AGE_MS) return m;
      this.mem.delete(key);
      this.memBytes -= m.bytes.byteLength;
    }
    try {
      const meta = JSON.parse(await readFile(join(CACHE_DIR, key + ".json"), "utf8")) as Omit<
        CacheEntry,
        "bytes"
      >;
      if (Date.now() - meta.storedAt >= MAX_AGE_MS) return null;
      const bytes = await readFile(join(CACHE_DIR, key + ".bin"));
      const entry: CacheEntry = { ...meta, bytes: new Uint8Array(bytes) };
      this.admit(key, entry);
      return entry;
    } catch {
      return null;
    }
  }

  async set(key: string, entry: Omit<CacheEntry, "storedAt">): Promise<void> {
    if (!this.enabled) return;
    const full: CacheEntry = { ...entry, storedAt: Date.now() };
    this.admit(key, full);
    try {
      await mkdir(CACHE_DIR, { recursive: true });
      await writeFile(join(CACHE_DIR, key + ".bin"), full.bytes);
      await writeFile(
        join(CACHE_DIR, key + ".json"),
        JSON.stringify({ contentType: full.contentType, fileName: full.fileName, storedAt: full.storedAt }),
      );
    } catch (e) {
      log.warn("cache disk write failed:", e);
    }
  }

  private admit(key: string, entry: CacheEntry): void {
    if (entry.bytes.byteLength > MAX_BYTES) return;
    while (this.memBytes + entry.bytes.byteLength > MAX_BYTES && this.mem.size > 0) {
      const oldestKey = this.mem.keys().next().value as string;
      const old = this.mem.get(oldestKey);
      this.mem.delete(oldestKey);
      if (old) this.memBytes -= old.bytes.byteLength;
    }
    this.mem.set(key, entry);
    this.memBytes += entry.bytes.byteLength;
  }

  async sweep(): Promise<{ removed: number }> {
    if (!this.enabled) return { removed: 0 };
    let removed = 0;
    const cutoff = Date.now() - MAX_AGE_MS;
    for (const [k, v] of this.mem) {
      if (v.storedAt < cutoff) {
        this.mem.delete(k);
        this.memBytes -= v.bytes.byteLength;
        removed++;
      }
    }
    try {
      const files = await readdir(CACHE_DIR);
      for (const f of files) {
        const p = join(CACHE_DIR, f);
        try {
          const s = await stat(p);
          if (s.mtimeMs < cutoff) {
            await unlink(p);
            removed++;
          }
        } catch {
          // ignore
        }
      }
    } catch {
      // dir doesn't exist; fine
    }
    return { removed };
  }

  stats() {
    return {
      enabled: this.enabled,
      entries: this.mem.size,
      memBytes: this.memBytes,
      maxBytes: MAX_BYTES,
      maxAgeMs: MAX_AGE_MS,
    };
  }

  clear(): void {
    this.mem.clear();
    this.memBytes = 0;
  }
}

export const resultCache = new ResultCache();

// Periodic disk sweep.
const sweeper = setInterval(() => {
  resultCache.sweep().catch(() => {});
}, 5 * 60_000);
sweeper.unref?.();
