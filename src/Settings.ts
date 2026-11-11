import type { ConvertPathNode, FileFormat } from "./FormatHandler.js";

export const SettingCategories = {
  size: { label: "Size", note: "Streches the image when both are set." },
  quality: { label: "Quality", note: "1 is the smallest file, 100 the best quality." },
  video: { label: "Video" },
  audio: { label: "Audio" },
  other: { label: "Other" },
} satisfies Record<string, { label: string; note?: string }>;

export interface OptionDisplay {
  label?: string;
  unit?: string;
  category?: keyof typeof SettingCategories;
}

export type OptionSpec = OptionDisplay &
  (
    | { type: "number"; min?: number; max?: number; integer?: boolean }
    | { type: "enum"; values: string[] }
    | { type: "boolean" }
    | {
        type: "string";
        maxLength?: number;
        pattern?: string;
      }
  );

// oxfmt-ignore
export const Settings = {
  // size
  width: { category: "size", label: "Width", unit: "px", type: "number", min: 1, integer: true },
  height: { category: "size", label: "Height", unit: "px", type: "number", min: 1, integer: true },
  // quality
  quality: { category: "quality", label: "Quality", type: "number", min: 1, max: 100, integer: true },
  // video
  videoCodec: { category: "video", label: "Codec", type: "enum", values: [] },
  fps: { category: "video", label: "Frame rate", unit: "fps", type: "number", min: 1, max: 240 },
  videoBitrate: { category: "video", label: "Bitrate", unit: "kbps", type: "number", min: 1, integer: true },
  // audio
  audioCodec: { category: "audio", label: "Codec", type: "enum", values: [] },
  audioBitrate: { category: "audio", label: "Bitrate", unit: "kbps", type: "number", min: 1, integer: true },
  sampleRate: { category: "audio", label: "Sample rate", unit: "Hz", type: "number", min: 1000, max: 384000, integer: true },
  channels: { category: "audio", label: "Channels", type: "number", min: 1, max: 8, integer: true },
} satisfies Record<string, OptionSpec>;

export type ConvertOptions = {
  [K in keyof typeof Settings]?: (typeof Settings)[K] extends { type: "number" }
    ? number
    : (typeof Settings)[K] extends { type: "boolean" }
      ? boolean
      : string;
} & { [key: string]: unknown };

export type FormatOptions = Record<string, OptionSpec | true>;

const own = <T>(object: Record<string, T> | undefined, key: string) =>
  object && Object.hasOwn(object, key) ? object[key] : undefined;

function specOf(format: FileFormat, key: string): OptionSpec | undefined {
  const declared = own(format.options, key);
  return declared === true ? own<OptionSpec>(Settings, key) : declared;
}

export function isValidOption(spec: OptionSpec, value: unknown): boolean {
  if (spec.type === "enum") return typeof value === "string" && spec.values.includes(value);
  if (spec.type === "boolean") return typeof value === "boolean";
  if (spec.type === "string") {
    if (typeof value !== "string" || value.length > (spec.maxLength ?? Infinity)) return false;
    if (spec.pattern === undefined) return true;
    try {
      return new RegExp(`^(?:${spec.pattern})$`, "u").test(value);
    } catch {
      return false;
    }
  }
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    (!spec.integer || Number.isInteger(value)) &&
    value >= (spec.min ?? -Infinity) &&
    value <= (spec.max ?? Infinity)
  );
}

export function sanitizeOptions(format: FileFormat, options: ConvertOptions = {}): ConvertOptions {
  return Object.fromEntries(
    Object.entries(options).filter(([key, value]) => {
      const spec = specOf(format, key);
      return spec && isValidOption(spec, value);
    }),
  );
}

function lastStepSupports(path: ConvertPathNode[], key: string, value: unknown) {
  if (path.length < 2) return false;
  const spec = specOf(path[path.length - 1].format, key);
  return spec !== undefined && isValidOption(spec, value);
}

export const pathSupportsOptions = (path: ConvertPathNode[], settings: ConvertOptions) =>
  Object.entries(settings).every(([key, value]) => lastStepSupports(path, key, value));

export function distributeOptions(path: ConvertPathNode[], settings: ConvertOptions) {
  const result: ConvertPathNode[] = path.map((node) => ({ ...node, options: undefined }));
  const unsupported: string[] = [];
  for (const [key, value] of Object.entries(settings)) {
    if (!lastStepSupports(path, key, value)) unsupported.push(key);
    else (result[result.length - 1].options ??= {})[key] = value;
  }
  return { path: result, unsupported };
}
