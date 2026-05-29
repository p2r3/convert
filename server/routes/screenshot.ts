import { Router } from "express";
import { captureUrl, type ScreenshotFormat } from "../lib/screenshot.ts";
import { badRequest } from "../lib/errors.ts";
import { log } from "../lib/log.ts";

const ALLOWED_FORMATS: ScreenshotFormat[] = ["png", "jpeg", "webp", "pdf"];

function parseInputs(body: Record<string, unknown>, query: Record<string, unknown>) {
  const src = { ...query, ...body };
  const url = typeof src.url === "string" ? src.url : "";
  if (!url) throw badRequest("Missing required field 'url'");
  const format = (typeof src.format === "string" ? src.format : "png").toLowerCase() as ScreenshotFormat;
  if (!ALLOWED_FORMATS.includes(format)) {
    throw badRequest(`format must be one of: ${ALLOWED_FORMATS.join(", ")}`);
  }
  const num = (k: string) => (src[k] !== undefined ? Number(src[k]) : undefined);
  const bool = (k: string) => {
    const v = src[k];
    if (v === undefined) return undefined;
    if (typeof v === "boolean") return v;
    return String(v).toLowerCase() === "true" || v === "1";
  };
  return {
    url,
    format,
    fullPage: bool("fullPage"),
    width: num("width"),
    height: num("height"),
    delayMs: num("delayMs") ?? num("delay"),
    timeoutMs: num("timeoutMs") ?? num("timeout"),
    quality: num("quality"),
    userAgent: typeof src.userAgent === "string" ? src.userAgent : undefined,
    youtubeThumbnail: bool("youtubeThumbnail") ?? bool("thumbnail"),
  };
}

export const screenshotRouter: Router = Router();

const handle = async (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => {
  try {
    const opts = parseInputs((req.body as Record<string, unknown>) || {}, req.query as Record<string, unknown>);
    log.info(`${req.method} /api/screenshot url=${opts.url} format=${opts.format}`);
    const result = await captureUrl(opts);
    // screenshot.<ext> is hardcoded ASCII so no injection risk, but keep it consistent.
    res.setHeader("content-type", result.contentType);
    res.setHeader("content-disposition", `inline; filename="screenshot.${result.extension}"`);
    res.send(Buffer.from(result.bytes));
  } catch (e) {
    next(e);
  }
};

screenshotRouter.post("/api/screenshot", handle);
screenshotRouter.get("/api/screenshot", handle);
