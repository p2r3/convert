import puppeteer, { type Browser, type Page } from "puppeteer";
import { log } from "./log.ts";

let browserPromise: Promise<Browser> | null = null;

/** Lazy singleton Puppeteer browser. Honors PUPPETEER_EXECUTABLE_PATH. */
export function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    const execPath = process.env.PUPPETEER_EXECUTABLE_PATH;
    log.info(`Launching puppeteer browser${execPath ? ` (executable=${execPath})` : ""}`);
    const baseArgs = [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--hide-scrollbars",
      "--mute-audio",
    ];
    if (process.env.CONVERT_API_IGNORE_CERT_ERRORS === "1" || process.env.NODE_ENV !== "production") {
      baseArgs.push("--ignore-certificate-errors");
    }
    browserPromise = puppeteer
      .launch({
        headless: true,
        executablePath: execPath || undefined,
        acceptInsecureCerts: process.env.CONVERT_API_IGNORE_CERT_ERRORS === "1",
        args: baseArgs,
      })
      .then((browser) => {
        // Auto-reset the singleton if the browser dies; next call relaunches.
        browser.on("disconnected", () => {
          log.warn("Browser disconnected; will relaunch on next request");
          browserPromise = null;
        });
        return browser;
      })
      .catch((e) => {
        browserPromise = null;
        throw e;
      });
  }
  return browserPromise;
}

export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    try {
      const b = await browserPromise;
      await b.close();
    } catch (e) {
      log.warn("Error closing browser:", e);
    } finally {
      browserPromise = null;
    }
  }
}

/**
 * Run a callback with a fresh page; always closes the page. Enforces a hard
 * Node-side deadline so a hung in-page promise can't leak the page indefinitely.
 */
export async function withPage<T>(fn: (page: Page) => Promise<T>, opts: { timeoutMs?: number } = {}): Promise<T> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  if (opts.timeoutMs) page.setDefaultNavigationTimeout(opts.timeoutMs);
  const deadlineMs = opts.timeoutMs ?? 180_000;
  let timer: NodeJS.Timeout | null = null;
  try {
    const work = fn(page);
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Browser page deadline exceeded after ${deadlineMs}ms`)), deadlineMs);
    });
    return await Promise.race([work, deadline]);
  } finally {
    if (timer) clearTimeout(timer);
    try {
      await page.close();
    } catch (e) {
      log.warn("Error closing page:", e);
    }
  }
}

/**
 * FIFO queue serializing browser work so we don't hammer Chromium with
 * concurrent heavy pages. Tunable via CONVERT_API_MAX_CONCURRENCY.
 */
const maxConcurrency = Math.max(1, Number(process.env.CONVERT_API_MAX_CONCURRENCY) || 2);
let active = 0;
const waiters: Array<() => void> = [];

function release(): void {
  active--;
  const next = waiters.shift();
  if (next) next();
}

export async function withBrowserSlot<T>(fn: () => Promise<T>): Promise<T> {
  // Wait if no capacity, then claim atomically by being the next runner after release.
  while (active >= maxConcurrency) {
    await new Promise<void>((res) => waiters.push(res));
  }
  active++;
  try {
    return await fn();
  } finally {
    release();
  }
}

export function browserPoolStats() {
  return { active, queued: waiters.length, maxConcurrency };
}

/**
 * Eagerly launch the browser on startup so the first request doesn't pay the
 * ~1.5s cold-start cost. Failures are non-fatal — the next real request will
 * retry.
 */
export async function warmBrowser(): Promise<void> {
  try {
    await getBrowser();
    log.info("Browser warm-up complete");
  } catch (e) {
    log.warn("Browser warm-up failed (will retry on demand):", e);
  }
}
