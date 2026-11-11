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
  width: { content: true, category: "size", label: "Width", unit: "px", type: "number", min: 1, integer: true },
  height: { content: true, category: "size", label: "Height", unit: "px", type: "number", min: 1, integer: true },
  // quality
  quality: { category: "quality", label: "Quality", type: "number", min: 1, max: 100, integer: true },
  // video
  videoCodec: { category: "video", label: "Codec", type: "enum", values: [] },
  fps: { content: true, category: "video", label: "Frame rate", unit: "fps", type: "number", min: 1, max: 240 },
  videoBitrate: { category: "video", label: "Bitrate", unit: "kbps", type: "number", min: 1, integer: true },
  // audio
  audioCodec: { category: "audio", label: "Codec", type: "enum", values: [] },
  audioBitrate: { category: "audio", label: "Bitrate", unit: "kbps", type: "number", min: 1, integer: true },
  sampleRate: { content: true, category: "audio", label: "Sample rate", unit: "Hz", type: "number", min: 1000, max: 384000, integer: true },
  channels: { content: true, category: "audio", label: "Channels", type: "number", min: 1, max: 8, integer: true },
} satisfies Record<string, OptionSpec & { content?: true }>; // content settings are applied at each step

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

function stepSupports(node: ConvertPathNode, key: string, value: unknown) {
  const spec = specOf(node.format, key);
  return spec !== undefined && isValidOption(spec, value);
}

export const pathSupportsOptions = (path: ConvertPathNode[], settings: ConvertOptions) =>
  Object.entries(settings).every(
    ([key, value]) => path.length > 1 && stepSupports(path[path.length - 1], key, value),
  );

export function distributeOptions(path: ConvertPathNode[], settings: ConvertOptions) {
  const result: ConvertPathNode[] = path.map((node) => ({ ...node, options: undefined }));
  const unsupported: string[] = [];
  for (const [key, value] of Object.entries(settings)) {
    const content = own<OptionSpec & { content?: true }>(Settings, key)?.content;
    const steps = result
      .slice(content ? 1 : Math.max(1, result.length - 1))
      .filter((node) => stepSupports(node, key, value));
    for (const node of steps) (node.options ??= {})[key] = value;
    if (!steps.length) unsupported.push(key);
  }
  return { path: result, unsupported };
}
