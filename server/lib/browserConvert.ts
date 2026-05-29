/**
 * Drives the existing browser-based converter via Puppeteer for conversions
 * not covered by the native fast-path. Requires the converter app to have
 * been built to `dist/` and reachable through the static-serve mount.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { withBrowserSlot, withPage } from "./browser.ts";
import { ApiError, badRequest, serverError } from "./errors.ts";
import { log } from "./log.ts";

const __filename = fileURLToPath(import.meta.url);
const distDir = resolve(__filename, "../../../dist");

export interface BrowserConvertOptions {
  /** Input file bytes. */
  bytes: Uint8Array;
  /** Input filename (used for extension detection by the converter). */
  fileName: string;
  /** Target output format extension (e.g. "png", "mp3"). */
  to: string;
  /** Optional explicit input format extension override. */
  from?: string;
  /** Base URL where the converter app is served (default: env or http://127.0.0.1:PORT). */
  baseUrl: string;
  /** Total deadline for the whole conversion (default 180s). */
  timeoutMs?: number;
}

export interface BrowserConvertResult {
  bytes: Uint8Array;
  fileName: string;
  contentType: string;
  /** Conversion path used by the underlying graph traversal. */
  path: string[];
}

export function isBrowserConverterAvailable(): boolean {
  return existsSync(resolve(distDir, "index.html"));
}

/** Cached prepared page kept hot to skip the multi-second handler init. */
let preparedPage:
  | {
      ready: Promise<void>;
      release: () => void;
    }
  | null = null;

/**
 * Convert a file by driving the existing browser converter through Puppeteer.
 * Throws ApiError(503) if the dist hasn't been built.
 */
export async function convertViaBrowser(opts: BrowserConvertOptions): Promise<BrowserConvertResult> {
  if (!isBrowserConverterAvailable()) {
    throw new ApiError(
      503,
      "Browser converter unavailable: run `npm run build` (or `bun run build`) to produce dist/ first.",
    );
  }
  return withBrowserSlot(async () => {
    return withPage(
      async (page) => {
        const timeoutMs = opts.timeoutMs ?? 180_000;
        page.setDefaultTimeout(timeoutMs);
        page.setDefaultNavigationTimeout(timeoutMs);

        page.on("console", (msg) => log.info(`[browser:${msg.type()}]`, msg.text()));

        const indexUrl = new URL("convert/index.html", opts.baseUrl).toString();
        log.info(`Driving browser converter at ${indexUrl}`);

        // Wait for the converter to finish building its initial format list.
        const ready = page.evaluate(
          () =>
            new Promise<void>((res) => {
              const origLog = console.log;
              console.log = function (...args: unknown[]) {
                if (typeof args[0] === "string" && args[0].includes("Built initial format list.")) {
                  res();
                }
                return origLog.apply(this, args as []);
              };
              // If the page logged it before we hooked, the popup will be hidden.
              setTimeout(() => {
                const popup = document.getElementById("popup");
                if (popup && (popup as HTMLElement).style.display === "none") res();
              }, 500);
            }),
        );

        await page.goto(indexUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
        await Promise.race([
          ready,
          new Promise<void>((_, rej) => setTimeout(() => rej(new Error("Format list build timed out")), 90_000)),
        ]);

        // Inject the input file via chunked Node→page transfer. Avoids the
        // O(n²) base64 string-concat trap on large uploads.
        const CHUNK = 256 * 1024;
        const chunks: string[] = [];
        for (let i = 0; i < opts.bytes.length; i += CHUNK) {
          const slice = opts.bytes.subarray(i, Math.min(opts.bytes.length, i + CHUNK));
          chunks.push(Buffer.from(slice).toString("base64"));
        }
        await page.evaluate(
          async (parts: string[], name: string) => {
            // Decode each base64 chunk separately to keep peak memory bounded.
            const buffers: Uint8Array[] = [];
            let total = 0;
            for (const p of parts) {
              const bin = atob(p);
              const u = new Uint8Array(bin.length);
              for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
              buffers.push(u);
              total += u.length;
            }
            const full = new Uint8Array(total);
            let off = 0;
            for (const b of buffers) {
              full.set(b, off);
              off += b.length;
            }
            const file = new File([full], name, { type: "" });
            const dt = new DataTransfer();
            dt.items.add(file);
            const input = document.getElementById("file-input") as HTMLInputElement;
            input.files = dt.files;
            input.dispatchEvent(new Event("change", { bubbles: true }));
          },
          chunks,
          opts.fileName,
        );

        // If user provided an explicit `from`, select that input button by extension match.
        if (opts.from) {
          await selectFormat(page, "#from-list", opts.from);
        } else {
          // Verify the auto-selected input is something
          await page.waitForFunction(() => !!document.querySelector("#from-list .selected"), { timeout: 10_000 });
        }
        await selectFormat(page, "#to-list", opts.to);

        // Intercept downloadFile to capture the output instead of triggering a browser download.
        // We chunk the base64 encoding inside the page so big outputs don't trigger the O(n²)
        // string-concat trap.
        const collected = await page.evaluate(
          () =>
            new Promise<{ name: string; chunks: string[] } | null>((res) => {
              const origClick = HTMLAnchorElement.prototype.click;
              HTMLAnchorElement.prototype.click = function () {
                const a = this as HTMLAnchorElement;
                if (a.download && a.href.startsWith("blob:")) {
                  fetch(a.href)
                    .then((r) => r.arrayBuffer())
                    .then((buf) => {
                      const bytes = new Uint8Array(buf);
                      const CHUNK = 64 * 1024;
                      const chunks: string[] = [];
                      for (let i = 0; i < bytes.length; i += CHUNK) {
                        const slice = bytes.subarray(i, Math.min(bytes.length, i + CHUNK));
                        // String.fromCharCode.apply with a bounded chunk avoids quadratic concat.
                        let s = "";
                        for (let j = 0; j < slice.length; j++) s += String.fromCharCode(slice[j]);
                        chunks.push(btoa(s));
                      }
                      res({ name: a.download, chunks });
                    })
                    .catch(() => res(null));
                  return;
                }
                return origClick.apply(this);
              };
              (document.getElementById("convert-button") as HTMLButtonElement).click();
              // Page-side safety timeout (Node-side deadline in withPage is the real backstop).
              setTimeout(() => res(null), 170_000);
            }),
        );

        if (!collected) throw serverError("Conversion produced no output (or timed out)");
        // Concatenate chunks on the Node side without building a giant string first.
        const decoded = collected.chunks.map((c) => Buffer.from(c, "base64"));
        const outBytes = new Uint8Array(Buffer.concat(decoded));

        const contentType = guessContentType(collected.name, opts.to);
        return {
          bytes: outBytes,
          fileName: collected.name,
          contentType,
          path: [opts.from ?? "auto", opts.to],
        };
      },
      { timeoutMs: opts.timeoutMs ?? 180_000 },
    );
  });
}

async function selectFormat(page: import("puppeteer").Page, listSelector: string, ext: string): Promise<void> {
  const target = ext.toLowerCase();
  const ok = await page.evaluate(
    (sel: string, target: string) => {
      const list = document.querySelector(sel);
      if (!list) return false;
      const buttons = Array.from(list.querySelectorAll("button")) as HTMLButtonElement[];
      const match =
        buttons.find((b) => (b.textContent || "").trim().toLowerCase().startsWith(target.toUpperCase() + " ")) ||
        buttons.find((b) => (b.textContent || "").toLowerCase().includes(`(${target})`)) ||
        buttons.find((b) => (b.getAttribute("mime-type") || "").toLowerCase().includes(`/${target}`));
      if (match) {
        match.click();
        match.scrollIntoView();
        return true;
      }
      return false;
    },
    listSelector,
    target,
  );
  if (!ok) throw badRequest(`Format "${ext}" not found in ${listSelector}`);
}

function guessContentType(fileName: string, fallbackExt: string): string {
  const ext = (fileName.split(".").pop() || fallbackExt).toLowerCase();
  const map: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    pdf: "application/pdf",
    mp3: "audio/mpeg",
    mp4: "video/mp4",
    wav: "audio/wav",
    ogg: "audio/ogg",
    txt: "text/plain",
    json: "application/json",
    html: "text/html",
    svg: "image/svg+xml",
    zip: "application/zip",
  };
  return map[ext] ?? "application/octet-stream";
}
