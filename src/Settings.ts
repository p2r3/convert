import type { ConvertPathNode, FileFormat } from "./FormatHandler.js";

/** The values an option accepts. Plain data, so it survives the format cache and workers. */
export type OptionSpec =
  | { type: "number"; min?: number; max?: number; integer?: boolean }
  | { type: "enum"; values: string[] };

/**
 * Settings shared between handlers. Handlers declare the ones they honour per output format
 * in {@link FileFormat.options} and read the values from `ctx.options`. A missing value means
 * "whatever the handler does by default".
 *
 * When the path is found automatically, `content` settings (properties of the media) are applied
 * once, by the first step that supports them. `encoding` settings (properties of the output
 * file) are only applied by the last step.
 */
export const Settings = {
  /** In pixels. With only one of width/height set, the aspect ratio is kept. */
  width: { scope: "content", type: "number", min: 1, integer: true },
  height: { scope: "content", type: "number", min: 1, integer: true },
  fps: { scope: "content", type: "number", min: 1, max: 240 },
  /** In Hz. */
  sampleRate: { scope: "content", type: "number", min: 1000, max: 384000, integer: true },
  channels: { scope: "content", type: "number", min: 1, max: 8, integer: true },
  /** Lossy encoder quality, 1 (worst) to 100 (best). */
  quality: { scope: "encoding", type: "number", min: 1, max: 100, integer: true },
  /** Codec names (e.g. "h264"), not encoder names. Formats list the values they accept. */
  videoCodec: { scope: "encoding", type: "enum", values: [] },
  audioCodec: { scope: "encoding", type: "enum", values: [] },
  /** In kbps. */
  videoBitrate: { scope: "encoding", type: "number", min: 1, integer: true },
  audioBitrate: { scope: "encoding", type: "number", min: 1, integer: true },
} satisfies Record<string, OptionSpec & { scope: "content" | "encoding" }>;

/** Option values for one conversion step. Handler-specific keys are allowed next to the shared ones. */
export type ConvertOptions = {
  [K in keyof typeof Settings]?: (typeof Settings)[K] extends { type: "number" } ? number : string;
} & { [key: string]: unknown };

/**
 * Options a format supports, by key. `true` uses the spec from {@link Settings};
 * handler-specific keys and narrowed specs (e.g. the codec list) are spelled out.
 */
export type FormatOptions = Record<string, OptionSpec | true>;

const own = <T>(object: Record<string, T> | undefined, key: string) =>
  object && Object.hasOwn(object, key) ? object[key] : undefined;

function specOf(format: FileFormat, key: string): OptionSpec | undefined {
  const declared = own(format.options, key);
  return declared === true ? own<OptionSpec>(Settings, key) : declared;
}

function isValid(spec: OptionSpec, value: unknown) {
  if (spec.type === "enum") return typeof value === "string" && spec.values.includes(value);
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    (!spec.integer || Number.isInteger(value)) &&
    value >= (spec.min ?? -Infinity) &&
    value <= (spec.max ?? Infinity)
  );
}

/**
 * Keeps the options `format` declares and whose values fit the spec.
 * Handlers only ever see the result, so they can trust the values (e.g. put them in a command line).
 */
export function sanitizeOptions(format: FileFormat, options: ConvertOptions = {}): ConvertOptions {
  return Object.fromEntries(
    Object.entries(options).filter(([key, value]) => {
      const spec = specOf(format, key);
      return spec && isValid(spec, value);
    }),
  );
}

/** Index of the step in `path` that should apply `key`, or -1 if no step can. */
function findStep(path: ConvertPathNode[], key: string) {
  // path[0] is the input, it isn't produced by any step
  if (own(Settings, key)?.scope === "content")
    return path.findIndex((node, i) => i > 0 && specOf(node.format, key));
  // handler-specific options count as encoding ones
  const last = path.length - 1;
  return last > 0 && specOf(path[last].format, key) ? last : -1;
}

/** Whether `path` can honour all of `keys`. */
export const pathSupportsOptions = (path: ConvertPathNode[], keys: string[]) =>
  keys.every((key) => findStep(path, key) !== -1);

/**
 * Hands the settings of an automatic conversion to the steps of `path` that should apply them.
 * @returns A copy of the path with `options` set, and the keys no step could take.
 */
export function distributeOptions(path: ConvertPathNode[], settings: ConvertOptions) {
  const result: ConvertPathNode[] = path.map((node) => ({ ...node, options: undefined }));
  const unsupported: string[] = [];
  for (const [key, value] of Object.entries(settings)) {
    const step = findStep(path, key);
    if (step === -1) unsupported.push(key);
    else (result[step].options ??= {})[key] = value;
  }
  return { path: result, unsupported };
}
