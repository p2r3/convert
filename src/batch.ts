import type { FileData, FileFormat, HandlerDefinition } from "./FormatHandler.js";
import { stripExt } from "./common/index.js";
import { categoriesOf, sameFormat } from "./ConversionSettings.js";
import { AUDIO_FILES, Category } from "./Formats.js";
import normalizeMimeType from "./normalizeMimeType.js";
import mime from "mime";

type Option = [FileFormat, HandlerDefinition];
type OptionsMap = Map<FileFormat, HandlerDefinition>;

/** What one selected file is converted from and to. */
export interface Target {
  from: Option | null;
  to: Option | null;
}

export interface TargetGroup<T> {
  from: Option;
  to: Option;
  items: T[];
}

function optionKey([format, handler]: Option) {
  return `${handler.name}|${format.mime}(${format.format})`;
}

/**
 * Groups items that share an input and an output option, keeping first-seen order.
 * Items of one group are converted together, so handlers that merge their inputs still can.
 */
export function groupByTarget<T extends { from: Option; to: Option }>(
  items: T[],
): TargetGroup<T>[] {
  const groups = new Map<string, TargetGroup<T>>();
  for (const item of items) {
    const key = `${optionKey(item.from)}>${optionKey(item.to)}`;
    const group = groups.get(key);
    if (group) group.items.push(item);
    else groups.set(key, { from: item.from, to: item.to, items: [item] });
  }
  return [...groups.values()];
}

/** Renames repeated names to "name (2).ext", "name (3).ext" and so on. */
export function uniqueNames(names: string[]): string[] {
  const taken = new Set<string>();
  return names.map((name) => {
    let unique = name;
    for (let n = 2; taken.has(unique); n++) {
      const base = stripExt(name);
      unique = `${base} (${n})${name.slice(base.length)}`;
    }
    taken.add(unique);
    return unique;
  });
}

/**
 * Swaps each output for its input wherever the output isn't smaller.
 * Outputs are returned untouched if they don't map one-to-one onto the inputs.
 */
export function keepSmaller(inputs: FileData[], outputs: FileData[]): FileData[] {
  if (inputs.length !== outputs.length) return outputs;
  return outputs.map((output, i) =>
    output.bytes.length < inputs[i].bytes.length ? output : inputs[i],
  );
}

function expandVideoContainerMimes(candidates: string[]): string[] {
  const out = new Set(candidates);
  for (const c of candidates) {
    if (c === "video/mp4" || c === "video/quicktime") {
      out.add("video/mp4");
      out.add("video/quicktime");
    }
  }
  return [...out];
}

function getMimeCandidatesForFile(file: File): string[] {
  const set = new Set<string>();
  const raw = file.type?.trim();
  if (raw) set.add(normalizeMimeType(raw));
  const fromPath = mime.getType(file.name);
  if (fromPath) set.add(normalizeMimeType(fromPath));
  const extOnly = file.name.split(".").pop()?.toLowerCase();
  if (extOnly) {
    const fromExt = mime.getType(extOnly);
    if (fromExt) set.add(normalizeMimeType(fromExt));
  }
  return expandVideoContainerMimes([...set]);
}

function formatMatchesUploadedFile(
  format: FileFormat,
  ext: string,
  mimeCandidates: string[],
): boolean {
  if (mimeCandidates.some((m) => m === format.mime)) return true;
  if (!ext) return false;
  const e = ext.toLowerCase();
  const fex = format.extension.toLowerCase();
  const fmt = format.format.toLowerCase();
  const intr = format.internal.toLowerCase();
  return (
    fex === e || fex.includes(e) || fmt === e || fmt.includes(e) || intr === e || intr.includes(e)
  );
}

export function getMatchingFromFormats(options: OptionsMap, files: File[]): OptionsMap {
  if (files.length === 0) return new Map();

  const file = files[0];
  const mimeCandidates = getMimeCandidatesForFile(file);
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  const matched: OptionsMap = new Map();

  for (const [format, handler] of options) {
    if (!format.from) continue;
    if (formatMatchesUploadedFile(format, ext, mimeCandidates)) {
      matched.set(format, handler);
    }
  }

  return matched;
}

function fileExt(file: File) {
  return file.name.split(".").pop()?.toLowerCase() || "";
}

/** Picks the input format when the file leaves no real doubt about it. */
function autoFromOption(options: OptionsMap, file: File, simple: boolean): Option | null {
  const matching = getMatchingFromFormats(options, [file]);
  if (!matching.size) return null;
  const first = matching.entries().next().value ?? null;
  if (!simple) return matching.size === 1 ? first : null;

  const mimeCandidates = getMimeCandidatesForFile(file);
  const ext = fileExt(file);

  const uniqueFormats = new Set<string>();
  for (const [format, handler] of matching) {
    uniqueFormats.add(`${format.mime}|${format.format}`);

    // chances are, this format is exactly what the user wants
    if (ext === format.extension && mimeCandidates.includes(format.mime)) {
      return [format, handler];
    }
  }
  return uniqueFormats.size === 1 ? first : null;
}

/** Fills in a target for every selected file that `stored` doesn't cover yet. */
export function resolveTargets(
  options: OptionsMap,
  files: [string, File][],
  stored: Record<string, Target>,
  simple: boolean,
): Record<string, Target> {
  const targets: Record<string, Target> = {};
  for (const [key, file] of files) {
    if (stored[key]) {
      targets[key] = stored[key];
      continue;
    }
    const from = autoFromOption(options, file, simple);
    // a new file takes the output already chosen for files of its format
    const sibling =
      from && Object.values(targets).find((t) => t.from && t.to && sameFormat(t.from[0], from[0]));
    targets[key] = { from, to: sibling ? sibling.to : null };
  }
  return targets;
}

/** Keys of the other files that a choice for the file under `activeKey` also applies to. */
export function siblingKeys(
  files: [string, File][],
  targets: Record<string, Target>,
  activeKey: string | undefined,
  kind: keyof Target,
): string[] {
  const activeFile = files.find(([key]) => key === activeKey)?.[1];
  if (!activeKey || !activeFile) return [];
  const activeFrom = targets[activeKey]?.from;
  return files
    .filter(([key, file]) => {
      if (key === activeKey) return false;
      // the input format is a guess from the name, the output follows the input format
      if (kind === "from") return fileExt(file) === fileExt(activeFile);
      const from = targets[key].from;
      return !!from && !!activeFrom && sameFormat(from[0], activeFrom[0]);
    })
    .map(([key]) => key);
}

/**
 * The special outputs that fit an input and deserve a shortcut, as the `format` of their
 * output: a list of 447 formats does not tell anyone that a PNG can be read or cut out.
 * @param sameTypeCount How many of the selected files have this input format.
 * @param hasWebGpu Whether the browser can run the upscalers at all.
 */
export function toolsFor(from: FileFormat, sameTypeCount: number, hasWebGpu: boolean): string[] {
  if (from.mime === "application/pdf") {
    return ["ocr", "pdf-pages", ...(sameTypeCount > 1 ? ["pdf-merged"] : [])];
  }
  const categories = categoriesOf(from);
  // a GIF is both: it goes with video, where a single still is not what is asked for
  if (categories.includes(Category.VIDEO)) {
    return [
      // a GIF is short and already shows its frames
      ...(categories.includes(Category.IMAGE) ? [] : ["contact-sheet"]),
      ...(hasWebGpu ? ["upscaled-film", "upscaled-animation"] : []),
    ];
  }
  if (categories.includes(Category.IMAGE) && !categories.includes(Category.VECTOR)) {
    return [
      "ocr",
      "nobg",
      ...(hasWebGpu ? ["upscaled-photo", "upscaled-drawing"] : []),
      ...(sameTypeCount > 1 ? ["pdf-from-images"] : []),
    ];
  }
  if (categories.includes(Category.AUDIO)) {
    // judged on the file itself, so only for the formats the check reads as they are
    const direct = AUDIO_FILES.some((f) => sameFormat(f, from));
    return [...(direct ? ["audio-check"] : []), "audio-video"];
  }
  return [];
}
