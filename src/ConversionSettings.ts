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
  /** Cut video and audio without re-encoding them. Only for output in the input's own format. */
  copyStreams?: boolean;
  /** Pages of a PDF to keep, such as "2-5,8". The handler checks it against the page count. */
  pages?: string;
  /** Degrees to turn every page of a PDF clockwise: 90, 180 or 270. */
  rotate?: number;
  /** Even out loudness to -14 LUFS, the level streaming services play at. */
  normalize?: boolean;
  /** Seconds of fade-in at the start. */
  fadeIn?: number;
  /** Seconds of fade-out at the end. */
  fadeOut?: number;
  /** Mix all channels down to one. */
  mono?: boolean;
  /** Play the audio backwards. */
  reverse?: boolean;
  /** Cut the silence at the start and the end. */
  trimSilence?: boolean;
  /** Playback speed without changing the pitch, 0.5–4. */
  speed?: number;
  /** Password that opens a protected PDF. */
  password?: string;
  /** Password to protect the output PDF with. */
  protect?: string;
  /** Number the pages of a PDF at the bottom. */
  pageNumbers?: boolean;
  /** Text to print diagonally across every page of a PDF, or across a picture. */
  watermark?: string;
  /** Palette size of a PNG, 2–256. Fewer colours make a smaller file. */
  colors?: number;
}

export type SettingKey = keyof ConversionSettings;

/** The only handlers that read {@link ConversionSettings}. */
export const SETTINGS_HANDLERS: ReadonlySet<string> = new Set([
  "FFmpeg",
  "mediabunny",
  "ImageMagick",
  "canvasToBlob",
  "compressPdf",
  "splitPdf",
]);

/** Settings that only FFmpeg's audio filters can apply. */
const AUDIO_EDITS = [
  "normalize",
  "fadeIn",
  "fadeOut",
  "mono",
  "reverse",
  "trimSilence",
  "speed",
] as const satisfies SettingKey[];

/** Whether the settings ask for an audio edit, which only FFmpeg can make. */
export function hasAudioEdits(settings: ConversionSettings) {
  return AUDIO_EDITS.some((key) => settings[key]);
}

const TEXT_SETTINGS: ReadonlySet<SettingKey> = new Set([
  "pages",
  "password",
  "protect",
  "watermark",
]);
const BOOLEAN_SETTINGS: ReadonlySet<SettingKey> = new Set([
  "stripMetadata",
  "copyStreams",
  "normalize",
  "mono",
  "reverse",
  "trimSilence",
  "pageNumbers",
]);

export function categoriesOf(format: FileFormat) {
  return Array.isArray(format.category) ? format.category : [format.category];
}

export function sameFormat(a: FileFormat, b: FileFormat) {
  return a.mime === b.mime && a.format === b.format;
}

/** Outputs of tools whose handlers read no settings (videoTools, imageTools, depth, metadata). */
const TOOL_FORMATS: ReadonlySet<string> = new Set([
  "contact-sheet",
  "audio-video",
  "favicon",
  "collage",
  "framed",
  "halftone",
  "ascii-html",
  "depth",
  "metadata",
]);

/**
 * Which settings make sense for the given output format.
 * @param input The format the file comes from, for settings that depend on both ends.
 *
 * shortcut: decided by category only, but just {@link SETTINGS_HANDLERS} read the settings.
 * Let handlers declare supported settings if more of them start using these.
 */
export function applicableSettings(format: FileFormat, input?: FileFormat): SettingKey[] {
  // tools with a handler of their own, which reads no settings
  if (TOOL_FORMATS.has(format.format)) return [];
  if (format.mime === "image/gif") return ["fps", "maxSize", "start", "end"];
  // the PDF tools (src/handlers/pdfTools.ts); a merged PDF has a handler of its own that reads none
  if (format.mime === "application/pdf") {
    if (format.format === "pdf-pages") return ["pages", "rotate", "password"];
    // only a PDF that stays a PDF goes through the tool that reads these
    return input && sameFormat(input, format)
      ? ["pages", "rotate", "quality", "password", "protect", "pageNumbers", "watermark"]
      : [];
  }

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
  if (isVideo || isAudio) keys.push("start", "end", "copyStreams");
  if (isImage || isVideo || isAudio) keys.push("stripMetadata");
  if (isImage) keys.push("watermark");
  if (format.format === "png") keys.push("colors");
  if (isAudio && !isVideo) keys.push(...AUDIO_EDITS);
  if (isVideo) keys.push("speed");
  return keys;
}

/** Range of the numeric settings that have one. */
const LIMITS: Partial<Record<SettingKey, [number, number]>> = {
  quality: [1, 100],
  speed: [0.5, 4],
  colors: [2, 256],
};

/**
 * Strips settings that are unset, invalid or don't apply to the output format.
 * @param defaults Used for keys the user left unset.
 * @param input The format the file comes from, see {@link applicableSettings}.
 */
export function settingsFor(
  settings: ConversionSettings,
  format: FileFormat,
  defaults: ConversionSettings = {},
  input?: FileFormat,
): ConversionSettings {
  const out: ConversionSettings = {};
  // one key at a time, which TypeScript can't follow through a union of value types
  const set = out as Record<SettingKey, unknown>;
  for (const key of applicableSettings(format, input)) {
    if (BOOLEAN_SETTINGS.has(key)) {
      if (settings[key]) set[key] = true;
      continue;
    }
    const value = settings[key] ?? defaults[key];
    if (TEXT_SETTINGS.has(key)) {
      const text = typeof value === "string" ? value.trim() : "";
      if (!text) continue;
      // mupdf takes its save options as one "key=value,key=value" string
      if ((key === "password" || key === "protect") && /[,=]/.test(text)) {
        throw new Error("A PDF password can't contain a comma or an equals sign.");
      }
      set[key] = text;
      continue;
    }
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) continue;
    if (key === "rotate" && (value % 90 !== 0 || value >= 360)) continue;
    if (key === "speed" && value === 1) continue;
    const [min, max] = LIMITS[key] ?? [0, Infinity];
    set[key] = Math.min(max, Math.max(min, value));
  }
  if (out.colors) out.colors = Math.round(out.colors);
  // filters re-encode the audio, so a stream can't be copied as it is
  if (hasAudioEdits(out)) delete out.copyStreams;
  // editing pages is not a request to re-encode the images at the default quality
  const pdfEdit = out.pages || out.rotate || out.password || out.protect || out.pageNumbers;
  if ((pdfEdit || out.watermark) && !settings.quality) delete out.quality;
  // an end before the start would produce an empty file
  if (out.start && out.end && out.end <= out.start) delete out.end;
  return out;
}

/** Whether the settings change what the file contains, rather than only how well it is encoded. */
export function altersContent(settings: ConversionSettings) {
  return !!(
    settings.maxSize ||
    settings.start ||
    settings.end ||
    settings.stripMetadata ||
    settings.pages ||
    settings.rotate ||
    settings.password ||
    settings.protect ||
    settings.pageNumbers ||
    settings.watermark ||
    hasAudioEdits(settings)
  );
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

/**
 * Arguments that cut a file without re-encoding it, the way LosslessCut does: seek in the input
 * and copy the streams. The result starts at the keyframe before `start`, because a copied
 * video stream can only begin on one.
 */
export function ffmpegCopyArgs(settings: ConversionSettings): {
  input: string[];
  output: string[];
} {
  const input = settings.start ? ["-ss", String(settings.start)] : [];
  const output: string[] = [];
  // seeking the input restarts its clock at zero, so the end becomes a duration
  if (settings.end) output.push("-t", String(settings.end - (settings.start ?? 0)));
  output.push("-c", "copy", "-avoid_negative_ts", "make_zero");
  if (settings.stripMetadata) output.push("-map_metadata", "-1");
  return { input, output };
}

/**
 * The audio edits as one "-af" filter chain, or undefined if none are set.
 * The cut happens here too, so that the fades land on the part that is kept.
 *
 * shortcut: the end of a file is only reachable by reversing it, and `areverse` holds all the
 * decoded audio in memory (about 500 MB per hour of stereo). Fine for songs; probe the duration
 * and use `afade=t=out:st=` instead if long recordings run out of memory.
 */
export function ffmpegAudioFilter(settings: ConversionSettings): string | undefined {
  if (!hasAudioEdits(settings)) return undefined;
  const { start, end, speed, fadeIn, fadeOut } = settings;
  const filters: string[] = [];
  if (start || end) {
    filters.push(
      `atrim=${[start && `start=${start}`, end && `end=${end}`].filter(Boolean).join(":")}`,
    );
    filters.push("asetpts=PTS-STARTPTS");
  }
  if (speed) filters.push(`atempo=${speed}`);
  if (settings.reverse) filters.push("areverse");
  // removes everything quieter than -50 dB before the first sound
  const silence = "silenceremove=start_periods=1:start_threshold=-50dB";
  if (settings.trimSilence) filters.push(silence);
  if (fadeIn) filters.push(`afade=t=in:d=${fadeIn}`);
  if (settings.trimSilence || fadeOut) {
    filters.push("areverse");
    if (settings.trimSilence) filters.push(silence);
    if (fadeOut) filters.push(`afade=t=in:d=${fadeOut}`);
    filters.push("areverse");
  }
  if (settings.mono) filters.push("aformat=channel_layouts=mono");
  if (settings.normalize) filters.push("loudnorm=I=-14:TP=-1");
  return filters.join(",");
}

/**
 * The video half of a speed change: the same cut as {@link ffmpegAudioFilter} makes, then the
 * frames played faster or slower. Undefined without a speed.
 */
export function ffmpegSpeedFilter(settings: ConversionSettings): string | undefined {
  const { start, end, speed } = settings;
  if (!speed) return undefined;
  const cut = [start && `start=${start}`, end && `end=${end}`].filter(Boolean).join(":");
  return `${cut ? `trim=${cut},` : ""}setpts=(PTS-STARTPTS)/${speed}`;
}

/** Every setting except the filters of {@link ffmpegScaleFilter} and {@link ffmpegAudioFilter}. */
export function ffmpegSettingsArgs(settings: ConversionSettings): string[] {
  // with audio edits the cut is part of the filter chain
  const args = hasAudioEdits(settings) ? [] : ffmpegTrimArgs(settings);
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
  // with a palette size it is lossy, which only ImageMagick does (see `compressorsFor`)
  "image/png": ["oxipng"],
  "application/pdf": ["compressPdf"],
  "image/svg+xml": ["minifySvg"],
  "text/html": ["minifyHtml"],
  "text/css": ["minifyCss"],
  "text/javascript": ["minifyJs"],
  "application/json": ["minifyJson"],
};
const MEDIA_COMPRESSORS = ["mediabunny", "FFmpeg"];

/**
 * Finds the handlers that can compress the given format into itself.
 * @param settings Narrows the choice when a setting needs one particular handler.
 * @returns Output format and handler pairs to try in order. Empty if the format isn't compressible.
 */
export function compressorsFor(
  format: FileFormat,
  handlers: HandlerDefinition[],
  settings: ConversionSettings = {},
): [FileFormat, HandlerDefinition][] {
  const categories = categoriesOf(format);
  const isMedia =
    !categories.includes(Category.IMAGE) &&
    (categories.includes(Category.VIDEO) || categories.includes(Category.AUDIO));
  // mediabunny always re-encodes, so only FFmpeg can copy streams, and it has no audio filters
  const media = settings.copyStreams || hasAudioEdits(settings) ? ["FFmpeg"] : MEDIA_COMPRESSORS;
  // oxipng only rewrites the PNG, it can't change what is in it
  const names =
    format.mime === "image/png" && (settings.colors || settings.watermark)
      ? ["ImageMagick"]
      : (COMPRESSORS[format.mime] ?? (isMedia ? media : []));

  const found: [FileFormat, HandlerDefinition][] = [];
  for (const name of names) {
    const handler = handlers.find((h) => h.name === name);
    const formats = handler?.supportedFormats?.filter((f) => sameFormat(f, format)) ?? [];
    const output = formats.find((f) => f.to);
    if (handler && output && formats.some((f) => f.from)) found.push([output, handler]);
  }
  return found;
}
