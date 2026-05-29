import { Router, type Request } from "express";
import multer from "multer";
import mime from "mime";
import { downloadUrl, sanitizeFilename } from "../lib/download.ts";
import { captureUrl, type ScreenshotFormat } from "../lib/screenshot.ts";
import { convertImage, normalizeSharpFormat } from "../lib/sharpConvert.ts";
import { convertViaBrowser, isBrowserConverterAvailable } from "../lib/browserConvert.ts";
import { isYouTubeUrl } from "../lib/youtube.ts";
import { badRequest, unsupported } from "../lib/errors.ts";
import { log } from "../lib/log.ts";

const MAX_UPLOAD_BYTES = Number(process.env.CONVERT_API_MAX_UPLOAD_BYTES) || 200 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
});

const SCREENSHOT_FORMATS: ScreenshotFormat[] = ["png", "jpeg", "webp", "pdf"];

interface ConvertInputs {
  to: string;
  from?: string;
  width?: number;
  height?: number;
  quality?: number;
  url?: string;
  fullPage?: boolean;
  delayMs?: number;
  youtubeThumbnail?: boolean;
  fileBytes?: Uint8Array;
  fileName?: string;
  fileMime?: string;
}

function parseInputs(req: Request): ConvertInputs {
  const body = (req.body || {}) as Record<string, unknown>;
  const query = (req.query || {}) as Record<string, unknown>;
  const src = { ...query, ...body };
  const to = typeof src.to === "string" ? src.to.toLowerCase().replace(/^\./, "") : "";
  if (!to) throw badRequest("Missing required field 'to' (target format extension, e.g. 'png')");
  const num = (k: string) => (src[k] !== undefined ? Number(src[k]) : undefined);
  const bool = (k: string) => {
    const v = src[k];
    if (v === undefined) return undefined;
    if (typeof v === "boolean") return v;
    return String(v).toLowerCase() === "true" || v === "1";
  };
  const inputs: ConvertInputs = {
    to,
    from: typeof src.from === "string" ? src.from.toLowerCase().replace(/^\./, "") : undefined,
    width: num("width"),
    height: num("height"),
    quality: num("quality"),
    fullPage: bool("fullPage"),
    delayMs: num("delayMs") ?? num("delay"),
    youtubeThumbnail: bool("youtubeThumbnail") ?? bool("thumbnail"),
  };
  if (typeof src.url === "string" && src.url) inputs.url = src.url;
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (file) {
    inputs.fileBytes = new Uint8Array(file.buffer);
    inputs.fileName = file.originalname || "upload.bin";
    inputs.fileMime = file.mimetype || undefined;
  }
  if (!inputs.fileBytes && !inputs.url) {
    throw badRequest("Provide either a 'file' multipart upload or a 'url' in the body/query");
  }
  return inputs;
}

function baseUrlOf(req: Request): string {
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol;
  const host = req.headers["x-forwarded-host"] || req.get("host");
  return `${proto}://${host}/`;
}

export const convertRouter: Router = Router();

convertRouter.post("/api/convert", upload.single("file"), async (req, res, next) => {
  try {
    const inputs = parseInputs(req);
    log.info(`POST /api/convert to=${inputs.to} url=${inputs.url ?? ""} file=${inputs.fileName ?? ""}`);

    // Case 1: URL input + screenshot-friendly output → direct capture.
    // Trigger screenshot for webpage-ish URLs (no recognizable file extension)
    // and always for YouTube. URLs that clearly point at a file fall through
    // to the download+convert path so we don't screenshot a JPEG host page.
    if (inputs.url && !inputs.fileBytes && SCREENSHOT_FORMATS.includes(inputs.to as ScreenshotFormat)) {
      const looksLikeFile = isLikelyFileUrl(inputs.url);
      if (!looksLikeFile || isYouTubeUrl(inputs.url)) {
        // Explicit `youtubeThumbnail=true` opts into the no-browser thumbnail
        // download; default and `=false` use the headless render.
        const ytThumb = inputs.youtubeThumbnail === true && isYouTubeUrl(inputs.url);
        const result = await captureUrl({
          url: inputs.url,
          format: inputs.to as ScreenshotFormat,
          width: inputs.width,
          height: inputs.height,
          delayMs: inputs.delayMs,
          fullPage: inputs.fullPage,
          quality: inputs.quality,
          youtubeThumbnail: ytThumb,
        });
        sendBinary(res, result.bytes, result.contentType, `screenshot.${result.extension}`);
        return;
      }
    }

    // Resolve URL → bytes if URL was given for a file conversion.
    let bytes = inputs.fileBytes;
    let fileName = inputs.fileName;
    let detectedMime = inputs.fileMime;
    if (!bytes && inputs.url) {
      const dl = await downloadUrl(inputs.url);
      bytes = dl.bytes;
      fileName = dl.fileName;
      detectedMime = dl.contentType ?? undefined;
    }
    if (!bytes) throw badRequest("No input bytes available");

    const fromExt = inputs.from || extOf(fileName, detectedMime);

    // Case 2: Image → image fast-path via sharp.
    const sharpFrom = fromExt ? normalizeSharpFormat(fromExt) : null;
    const sharpTo = normalizeSharpFormat(inputs.to);
    if (sharpFrom && sharpTo) {
      try {
        const result = await convertImage({
          bytes,
          to: sharpTo,
          width: inputs.width,
          height: inputs.height,
          quality: inputs.quality,
        });
        if (result) {
          sendBinary(res, result.bytes, result.contentType, `converted.${result.extension}`);
          return;
        }
      } catch (e) {
        log.warn("sharp path failed, falling back to browser converter:", e);
      }
    }

    // Case 3: Drive the existing browser-based converter.
    if (!isBrowserConverterAvailable()) {
      throw unsupported(
        `No native fast-path for ${fromExt} → ${inputs.to}. The full browser converter is not built — ` +
          "run `npm run build` (or `bun run build`) to produce dist/, then retry.",
      );
    }
    const result = await convertViaBrowser({
      bytes,
      fileName: fileName || `input.${fromExt || "bin"}`,
      to: inputs.to,
      from: inputs.from,
      baseUrl: baseUrlOf(req),
    });
    sendBinary(res, result.bytes, result.contentType, result.fileName);
  } catch (e) {
    next(e);
  }
});

function sendBinary(res: import("express").Response, bytes: Uint8Array, contentType: string, fileName: string) {
  res.setHeader("content-type", contentType);
  res.setHeader("content-disposition", contentDispositionHeader(fileName));
  res.send(Buffer.from(bytes));
}

function contentDispositionHeader(rawName: string): string {
  const safe = sanitizeFilename(rawName);
  // ASCII fallback (per RFC 6266) + UTF-8 form for non-ASCII.
  const ascii = safe.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  const utf8 = encodeURIComponent(safe);
  return `inline; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}

/** True when the URL path ends with a known non-html file extension. */
function isLikelyFileUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    const last = u.pathname.split("/").filter(Boolean).pop() || "";
    const m = /\.([a-z0-9]{1,6})$/i.exec(last);
    if (!m) return false;
    const ext = m[1].toLowerCase();
    // Treat html/htm/php/aspx/jsp as "webpage" — don't download.
    if (["html", "htm", "php", "aspx", "asp", "jsp", "cgi"].includes(ext)) return false;
    return !!mime.getType(ext);
  } catch {
    return false;
  }
}

function extOf(name?: string, mimeType?: string): string | undefined {
  if (name) {
    const e = name.split(".").pop();
    if (e && e.length <= 6) return e.toLowerCase();
  }
  if (mimeType) {
    const e = mime.getExtension(mimeType.split(";")[0].trim());
    if (e) return e.toLowerCase();
  }
  return undefined;
}
