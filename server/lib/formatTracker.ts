/**
 * Tracks additions/removals to the format list across server restarts and
 * fans out events to SSE listeners + registered webhooks. The format snapshot
 * is persisted to disk so adding a new handler in a fresh deployment still
 * generates an "added" event.
 */

import { EventEmitter } from "node:events";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { log } from "./log.ts";

export interface TrackedFormat {
  format: string;
  mime: string;
  name: string;
  extension: string;
  category?: string | string[];
  from?: boolean;
  to?: boolean;
}

export interface FormatChange {
  id: string;
  at: number;
  type: "added" | "removed";
  format: TrackedFormat;
}

export interface FormatSubscription {
  id: string;
  url: string;
  /** Optional HMAC secret used to sign the payload (X-Convert-Signature). */
  secret?: string;
  events: Array<"added" | "removed">;
  createdAt: number;
  lastDeliveryStatus?: number;
  lastDeliveryError?: string;
}

const STATE_DIR = process.env.CONVERT_API_STATE_DIR || "/tmp/convert-api-state";
const SNAPSHOT_FILE = resolve(STATE_DIR, "formats-snapshot.json");
const CHANGES_FILE = resolve(STATE_DIR, "formats-changes.json");
const SUBS_FILE = resolve(STATE_DIR, "format-subscriptions.json");
const MAX_CHANGES = 500;

class FormatTracker extends EventEmitter {
  private snapshot: Map<string, TrackedFormat> = new Map();
  private changes: FormatChange[] = [];
  private subscriptions: Map<string, FormatSubscription> = new Map();
  private loaded = false;
  private writeQueue: Promise<unknown> = Promise.resolve();

  async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    await mkdir(STATE_DIR, { recursive: true }).catch(() => {});
    try {
      const data = JSON.parse(await readFile(SNAPSHOT_FILE, "utf8")) as Array<[string, TrackedFormat]>;
      this.snapshot = new Map(data);
    } catch {
      // first run
    }
    try {
      this.changes = JSON.parse(await readFile(CHANGES_FILE, "utf8")) as FormatChange[];
    } catch {
      this.changes = [];
    }
    try {
      const subs = JSON.parse(await readFile(SUBS_FILE, "utf8")) as FormatSubscription[];
      this.subscriptions = new Map(subs.map((s) => [s.id, s]));
    } catch {
      this.subscriptions = new Map();
    }
  }

  /** Update the snapshot from a current set; returns the diff and persists. */
  async reconcile(current: TrackedFormat[]): Promise<{ added: TrackedFormat[]; removed: TrackedFormat[] }> {
    await this.load();
    const currentMap = new Map<string, TrackedFormat>();
    for (const f of current) currentMap.set(this.key(f), f);

    const added: TrackedFormat[] = [];
    const removed: TrackedFormat[] = [];
    for (const [k, f] of currentMap) {
      if (!this.snapshot.has(k)) added.push(f);
    }
    for (const [k, f] of this.snapshot) {
      if (!currentMap.has(k)) removed.push(f);
    }

    if (added.length === 0 && removed.length === 0) return { added, removed };

    const now = Date.now();
    for (const f of added) {
      const ch: FormatChange = { id: randomUUID(), at: now, type: "added", format: f };
      this.changes.unshift(ch);
      this.emit("change", ch);
      this.fanout(ch);
    }
    for (const f of removed) {
      const ch: FormatChange = { id: randomUUID(), at: now, type: "removed", format: f };
      this.changes.unshift(ch);
      this.emit("change", ch);
      this.fanout(ch);
    }
    if (this.changes.length > MAX_CHANGES) this.changes.length = MAX_CHANGES;
    this.snapshot = currentMap;
    await this.persist();
    log.info(`Format diff: +${added.length} / -${removed.length}`);
    return { added, removed };
  }

  recentChanges(limit = 50): FormatChange[] {
    return this.changes.slice(0, limit);
  }

  subscribe(input: { url: string; secret?: string; events?: Array<"added" | "removed"> }): FormatSubscription {
    const id = randomUUID();
    const sub: FormatSubscription = {
      id,
      url: input.url,
      secret: input.secret,
      events: input.events && input.events.length > 0 ? input.events : ["added", "removed"],
      createdAt: Date.now(),
    };
    this.subscriptions.set(id, sub);
    void this.persistSubs();
    return sub;
  }

  unsubscribe(id: string): boolean {
    const ok = this.subscriptions.delete(id);
    if (ok) void this.persistSubs();
    return ok;
  }

  listSubscriptions(): FormatSubscription[] {
    return Array.from(this.subscriptions.values()).map((s) => ({ ...s, secret: s.secret ? "***" : undefined }));
  }

  private key(f: TrackedFormat): string {
    return `${(f.mime || "").toLowerCase()}|${(f.format || "").toLowerCase()}`;
  }

  private async persist(): Promise<void> {
    this.writeQueue = this.writeQueue
      .then(async () => {
        await mkdir(STATE_DIR, { recursive: true }).catch(() => {});
        await writeFile(SNAPSHOT_FILE, JSON.stringify(Array.from(this.snapshot.entries())));
        await writeFile(CHANGES_FILE, JSON.stringify(this.changes));
      })
      .catch((e) => log.warn("format tracker persist failed:", e));
    await this.writeQueue;
  }

  private async persistSubs(): Promise<void> {
    this.writeQueue = this.writeQueue
      .then(async () => {
        await mkdir(STATE_DIR, { recursive: true }).catch(() => {});
        await writeFile(SUBS_FILE, JSON.stringify(Array.from(this.subscriptions.values())));
      })
      .catch((e) => log.warn("format tracker persist subs failed:", e));
    await this.writeQueue;
  }

  private fanout(change: FormatChange): void {
    for (const sub of this.subscriptions.values()) {
      if (!sub.events.includes(change.type)) continue;
      void this.deliver(sub, change);
    }
  }

  private async deliver(sub: FormatSubscription, change: FormatChange): Promise<void> {
    const body = JSON.stringify({
      event: change.type,
      changeId: change.id,
      at: change.at,
      format: change.format,
    });
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "user-agent": "convert-api/format-webhook",
      "x-convert-event": change.type,
      "x-convert-change-id": change.id,
    };
    if (sub.secret) {
      const sig = createHash("sha256").update(sub.secret).update(body).digest("hex");
      headers["x-convert-signature"] = `sha256=${sig}`;
    }
    try {
      const res = await fetch(sub.url, { method: "POST", headers, body });
      sub.lastDeliveryStatus = res.status;
      sub.lastDeliveryError = res.ok ? undefined : `HTTP ${res.status}`;
    } catch (e) {
      sub.lastDeliveryError = e instanceof Error ? e.message : String(e);
    }
    void this.persistSubs();
  }
}

export const formatTracker = new FormatTracker();
