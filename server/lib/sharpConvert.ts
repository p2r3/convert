/**
 * Native fast-path image conversions via `sharp`.
 * Used for the common case where input and output are both raster formats
 * (PNG/JPEG/WEBP/AVIF/TIFF/GIF/HEIF/PDF-page-out). Avoids spinning up the
 * full browser converter for trivial transcodes.
 */

import { unsupported } from "./errors.ts";

export type SharpFormat = "png" | "jpeg" | "webp" | "avif" | "tiff" | "gif" | "heif" | "raw";

const ALIASES: Record<string, SharpFormat> = {
  png: "png",
  jpg: "jpeg",
  jpeg: "jpeg",
  webp: "webp",
  avif: "avif",
  tif: "tiff",
  tiff: "tiff",
  gif: "gif",
  heic: "heif",
  heif: "heif",
};

export function normalizeSharpFormat(s: string): SharpFormat | null {
  return ALIASES[s.toLowerCase()] ?? null;
}

export interface SharpConvertOptions {
  bytes: Uint8Array;
  to: SharpFormat;
  width?: number;
  height?: number;
  quality?: number;
}

export interface SharpConvertResult {
  bytes: Uint8Array;
  contentType: string;
  extension: string;
}

const CONTENT_TYPES: Record<SharpFormat, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  avif: "image/avif",
  tiff: "image/tiff",
  gif: "image/gif",
  heif: "image/heif",
  raw: "application/octet-stream",
};

const EXTENSIONS: Record<SharpFormat, string> = {
  png: "png",
  jpeg: "jpg",
  webp: "webp",
  avif: "avif",
  tiff: "tiff",
  gif: "gif",
  heif: "heif",
  raw: "raw",
};

/** Returns null if `sharp` isn't installed; caller should fall back. */
export async function convertImage(opts: SharpConvertOptions): Promise<SharpConvertResult | null> {
  let sharpMod: typeof import("sharp") | null = null;
  try {
    sharpMod = (await import("sharp")).default as unknown as typeof import("sharp");
  } catch {
    return null;
  }
  const sharp = sharpMod as unknown as (input: Uint8Array | Buffer) => import("sharp").Sharp;
  let pipeline = sharp(opts.bytes);
  if (opts.width || opts.height) {
    pipeline = pipeline.resize({ width: opts.width, height: opts.height, fit: "inside" });
  }
  switch (opts.to) {
    case "jpeg":
      pipeline = pipeline.jpeg({ quality: opts.quality ?? 90 });
      break;
    case "png":
      pipeline = pipeline.png();
      break;
    case "webp":
      pipeline = pipeline.webp({ quality: opts.quality ?? 90 });
      break;
    case "avif":
      pipeline = pipeline.avif({ quality: opts.quality ?? 60 });
      break;
    case "tiff":
      pipeline = pipeline.tiff();
      break;
    case "gif":
      pipeline = pipeline.gif();
      break;
    case "heif":
      pipeline = pipeline.heif({ quality: opts.quality ?? 80, compression: "av1" });
      break;
    default:
      throw unsupported(`Output format ${opts.to} not supported by sharp fast-path`);
  }
  const out = await pipeline.toBuffer();
  return {
    bytes: new Uint8Array(out),
    contentType: CONTENT_TYPES[opts.to],
    extension: EXTENSIONS[opts.to],
  };
}
