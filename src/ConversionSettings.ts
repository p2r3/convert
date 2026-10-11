import type { FileFormat, HandlerDefinition } from "./FormatHandler.js";
import { Category } from "./Formats.js";

/** Optional user-chosen output settings. An unset key means "handler default". */
export interface ConversionSettings {
  /** Lossy image quality, 1–100. */
  quality?: number;
  /** Frames per second. */
  fps?: number;
  /** Video bitrate in kbps. */
  videoBitrate?: number;
  /** Audio bitrate in kbps. */
  audioBitrate?: number;
  /** Longest side in pixels. Never enlarges. */
  maxSize?: number;
  /** Start of the kept section, in seconds. */
  start?: number;
  /** End of the kept section, in seconds. */
  end?: number;
  /** Drop EXIF, GPS and other descriptive metadata. */
  stripMetadata?: boolean;
}

export type SettingKey = keyof ConversionSettings;

/** The only handlers that read {@link ConversionSettings}. */
export const SETTINGS_HANDLERS: ReadonlySet<string> = new Set([
  "FFmpeg",
  "mediabunny",
  "ImageMagick",
  "canvasToBlob",
]);

function categoriesOf(format: FileFormat) {
  return Array.isArray(format.category) ? format.category : [format.category];
}

export function sameFormat(a: FileFormat, b: FileFormat) {
  return a.mime === b.mime && a.format === b.format;
}

/**
 * Which settings make sense for the given output format.
 *
 * shortcut: decided by category only, but just {@link SETTINGS_HANDLERS} read the settings.
 * Let handlers declare supported settings if more of them start using these.
 */
export function applicableSettings(format: FileFormat): SettingKey[] {
  if (format.mime === "image/gif") return ["fps", "maxSize", "start", "end"];

  const categories = categoriesOf(format);
  // vector images have no pixels to resize or re-encode
  const isImage = categories.includes(Category.IMAGE) && !categories.includes(Category.VECTOR);
  const isVideo = categories.includes(Category.VIDEO);
  const isAudio = categories.includes(Category.AUDIO);
  const keys: SettingKey[] = [];
  // for lossless formats, encoders read "quality" as a compression level instead
  if (isImage && !format.lossless) keys.push("quality");
  if (isVideo) keys.push("fps", "videoBitrate");
  if (isVideo || isAudio) keys.push("audioBitrate");
  if (isImage || isVideo) keys.push("maxSize");
  if (isVideo || isAudio) keys.push("start", "end");
  if (isImage || isVideo || isAudio) keys.push("stripMetadata");
  return keys;
}

/**
 * Strips settings that are unset, invalid or don't apply to the output format.
 * @param defaults Used for keys the user left unset.
 */
export function settingsFor(
  settings: ConversionSettings,
  format: FileFormat,
  defaults: ConversionSettings = {},
): ConversionSettings {
  const out: ConversionSettings = {};
  for (const key of applicableSettings(format)) {
    if (key === "stripMetadata") {
      if (settings.stripMetadata) out.stripMetadata = true;
      continue;
    }
    const value = settings[key] ?? defaults[key];
    if (!value || !Number.isFinite(value) || value <= 0) continue;
    out[key] = key === "quality" ? Math.min(100, value) : value;
  }
  // an end before the start would produce an empty file
  if (out.start && out.end && out.end <= out.start) delete out.end;
  return out;
}

/** Whether the settings change what the file contains, rather than only how well it is encoded. */
export function altersContent(settings: ConversionSettings) {
  return !!(settings.maxSize || settings.start || settings.end || settings.stripMetadata);
}

/** Scales the longest side down to `maxSize`, keeping the aspect ratio and even dimensions. */
export function ffmpegScaleFilter(settings: ConversionSettings): string | undefined {
  const n = settings.maxSize;
  if (!n) return undefined;
  return `scale=w='min(iw,${n})':h='min(ih,${n})':force_original_aspect_ratio=decrease:force_divisible_by=2`;
}

/** Output options that cut the result to the chosen section. */
export function ffmpegTrimArgs(settings: ConversionSettings): string[] {
  const args: string[] = [];
  if (settings.start) args.push("-ss", String(settings.start));
  if (settings.end) args.push("-to", String(settings.end));
  return args;
}

/** Every setting except {@link ffmpegScaleFilter}, which has to be merged with other filters. */
export function ffmpegSettingsArgs(settings: ConversionSettings): string[] {
  const args = ffmpegTrimArgs(settings);
  if (settings.fps) args.push("-r", String(settings.fps));
  if (settings.videoBitrate) args.push("-b:v", `${settings.videoBitrate}k`);
  if (settings.audioBitrate) args.push("-b:a", `${settings.audioBitrate}k`);
  if (settings.stripMetadata) args.push("-map_metadata", "-1");
  return args;
}

/** Defaults for converting a format into itself, where the handler's own default would gain nothing. */
export const COMPRESS_DEFAULTS: ConversionSettings = { quality: 70 };

/**
 * Handlers trusted to turn a format into a smaller file of the same format, best first.
 * An explicit list, because "any handler that reads and writes the format" includes handlers
 * that do something else entirely (meyda turns a JPEG spectrogram back into audio data).
 */
const COMPRESSORS: Record<string, string[]> = {
  "image/jpeg": ["ImageMagick", "canvasToBlob"],
  "image/webp": ["ImageMagick", "canvasToBlob"],
  "image/avif": ["ImageMagick"],
  "image/svg+xml": ["minifySvg"],
  "text/html": ["minifyHtml"],
  "text/css": ["minifyCss"],
  "text/javascript": ["minifyJs"],
  "application/json": ["minifyJson"],
};
const MEDIA_COMPRESSORS = ["mediabunny", "FFmpeg"];

/**
 * Finds the handlers that can compress the given format into itself.
 * @returns Output format and handler pairs to try in order. Empty if the format isn't compressible.
 */
export function compressorsFor(
  format: FileFormat,
  handlers: HandlerDefinition[],
): [FileFormat, HandlerDefinition][] {
  const categories = categoriesOf(format);
  const isMedia =
    !categories.includes(Category.IMAGE) &&
    (categories.includes(Category.VIDEO) || categories.includes(Category.AUDIO));
  const names = COMPRESSORS[format.mime] ?? (isMedia ? MEDIA_COMPRESSORS : []);

  const found: [FileFormat, HandlerDefinition][] = [];
  for (const name of names) {
    const handler = handlers.find((h) => h.name === name);
    const formats = handler?.supportedFormats?.filter((f) => sameFormat(f, format)) ?? [];
    const output = formats.find((f) => f.to);
    if (handler && output && formats.some((f) => f.from)) found.push([output, handler]);
  }
  return found;
}
