import { type Page } from "puppeteer";
import { withPage, withBrowserSlot } from "./browser.ts";
import { assertSafeUrl, downloadUrl } from "./download.ts";
import { isYouTubeUrl, youtubeThumbnailUrl, youtubeVideoId } from "./youtube.ts";
import { badRequest } from "./errors.ts";
import { log } from "./log.ts";

export type ScreenshotFormat = "png" | "jpeg" | "webp" | "pdf";

export interface ScreenshotOptions {
  url: string;
  format?: ScreenshotFormat;
  fullPage?: boolean;
  width?: number;
  height?: number;
  /** ms to wait after load before capture. */
  delayMs?: number;
  /** total navigation timeout */
  timeoutMs?: number;
  /** jpeg/webp quality (1-100). */
  quality?: number;
  /** Send a User-Agent override. */
  userAgent?: string;
  /** Force youtube to download thumbnail rather than render the player. */
  youtubeThumbnail?: boolean;
}

export interface ScreenshotResult {
  bytes: Uint8Array;
  contentType: string;
  extension: string;
}

const DEFAULT_VIEWPORT = { width: 1366, height: 900 };

const contentTypeFor = (fmt: ScreenshotFormat) =>
  fmt === "pdf" ? "application/pdf" : fmt === "jpeg" ? "image/jpeg" : fmt === "webp" ? "image/webp" : "image/png";

const extensionFor = (fmt: ScreenshotFormat) => (fmt === "jpeg" ? "jpg" : fmt);

/**
 * Capture a URL as an image (PNG/JPEG/WEBP) or PDF.
 * Special-cases YouTube to wait for the video player to render or grab thumbnail.
 */
export async function captureUrl(opts: ScreenshotOptions): Promise<ScreenshotResult> {
  const url = opts.url;
  await assertSafeUrl(url);
  const format = opts.format ?? "png";

  // Fast-path: YouTube thumbnail request — direct download, no browser.
  if (opts.youtubeThumbnail && isYouTubeUrl(url)) {
    const id = youtubeVideoId(url);
    if (!id) throw badRequest("Could not extract YouTube video id");
    let lastErr: unknown = null;
    for (const q of ["max", "hq", "mq", "default"] as const) {
      try {
        const thumb = await downloadUrl(youtubeThumbnailUrl(id, q));
        return { bytes: thumb.bytes, contentType: "image/jpeg", extension: "jpg" };
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("YouTube thumbnail unavailable");
  }

  return withBrowserSlot(() =>
    withPage(
      async (page) => {
        await page.setViewport({
          width: opts.width ?? DEFAULT_VIEWPORT.width,
          height: opts.height ?? DEFAULT_VIEWPORT.height,
          deviceScaleFactor: 1,
        });
        if (opts.userAgent) {
          await page.setUserAgent(opts.userAgent);
        }
        const navTimeout = opts.timeoutMs ?? 45_000;
        page.setDefaultNavigationTimeout(navTimeout);

        log.info(`Navigating to ${url}`);
        await page.goto(url, { waitUntil: "networkidle2", timeout: navTimeout });

        if (isYouTubeUrl(url)) {
          await prepareYouTube(page);
        }

        if (opts.delayMs && opts.delayMs > 0) {
          await new Promise((r) => setTimeout(r, opts.delayMs));
        }

        if (format === "pdf") {
          const buffer = await page.pdf({ format: "A4", printBackground: true });
          return {
            bytes: new Uint8Array(buffer),
            contentType: "application/pdf",
            extension: "pdf",
          };
        }

        const shotOpts: Record<string, unknown> = {
          type: format,
          fullPage: opts.fullPage ?? false,
        };
        if (format === "jpeg" || format === "webp") {
          shotOpts.quality = opts.quality ?? 90;
        }
        const buffer = (await page.screenshot(shotOpts as Parameters<Page["screenshot"]>[0])) as Buffer;

        return {
          bytes: new Uint8Array(buffer),
          contentType: contentTypeFor(format),
          extension: extensionFor(format),
        };
      },
      { timeoutMs: opts.timeoutMs ?? 45_000 },
    ),
  );
}

async function prepareYouTube(page: Page): Promise<void> {
  // Dismiss the EU consent dialog if present.
  await page
    .evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button")) as HTMLButtonElement[];
      const btn = buttons.find((b) => {
        const t = (b.textContent || "").trim().toLowerCase();
        return t.includes("accept all") || t.includes("reject all") || t === "i agree";
      });
      if (btn) btn.click();
    })
    .catch(() => {});

  // Wait for the player container, with a generous fallback.
  await Promise.race([
    page.waitForSelector("#movie_player, ytd-player, .html5-video-player", { timeout: 15_000 }).catch(() => null),
    new Promise((r) => setTimeout(r, 15_000)),
  ]);

  // Hide the autoplay/cards/consent overlays so the player frame is clean.
  await page
    .evaluate(() => {
      const style = document.createElement("style");
      style.textContent = `
        .ytp-pause-overlay, .ytp-cards-button, .ytp-ce-element, .ytp-popup,
        ytd-consent-bump-v2-lightbox, .ytp-cued-thumbnail-overlay-image,
        ytd-popup-container, tp-yt-paper-dialog, tp-yt-iron-overlay-backdrop {
          display: none !important;
          opacity: 0 !important;
          visibility: hidden !important;
        }
      `;
      document.head.appendChild(style);
    })
    .catch(() => {});

  // Give the player a moment to swap from thumbnail to canvas.
  await new Promise((r) => setTimeout(r, 1500));
}
