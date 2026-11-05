import mime from "mime";
import normalizeMimeType from "./normalizeMimeType.ts";
import { getExt } from "./common/index.ts";
import type { FileFormat } from "./FormatHandler.ts";

/** Anything with a name: a browser `File` or a `FileData`. */
export interface FileLike {
  name: string;
  /** MIME type reported by the browser, if any. */
  type?: string;
}

/** How well a format matched, best first. */
export type FormatMatch = "exact" | "extension" | "mime" | "loose";
const MATCH_ORDER: FormatMatch[] = ["exact", "extension", "mime", "loose"];

/** These containers are often mislabeled as each other. */
const MIME_ALIASES: string[][] = [["video/mp4", "video/quicktime"]];

/** Normalized MIME type guesses from the file's own type, its name and its extension. */
export function getMimeCandidates(file: FileLike): string[] {
  const set = new Set<string>();
  const raw = file.type?.trim();
  if (raw) set.add(normalizeMimeType(raw));
  const fromName = mime.getType(file.name);
  if (fromName) set.add(normalizeMimeType(fromName));
  for (const aliases of MIME_ALIASES) {
    if (aliases.some((alias) => set.has(alias))) aliases.forEach((alias) => set.add(alias));
  }
  return [...set];
}

function matchFormat(
  format: FileFormat,
  ext: string,
  mimes: string[],
  loose: boolean,
): FormatMatch | null {
  const sameExt = !!ext && format.extension.toLowerCase() === ext;
  const sameMime = mimes.includes(format.mime);
  if (sameExt && sameMime) return "exact";
  if (sameExt) return "extension";
  if (sameMime) return "mime";
  if (loose && ext) {
    const fields = [format.extension, format.format, format.internal];
    if (fields.some((field) => field.toLowerCase().includes(ext))) return "loose";
  }
  return null;
}

/**
 * Lists the formats a file could be, best match first. Formats with the same match quality keep
 * their input order, so handler priority is preserved.
 * @param loose Also match formats whose extension, short name or internal name merely contain
 *   the file's extension. Good for suggestions, too broad for deciding what a file is.
 */
export function detectFormatMatches(
  file: FileLike,
  formats: Iterable<FileFormat>,
  { loose = false } = {},
): { format: FileFormat; match: FormatMatch }[] {
  const ext = getExt(file.name).toLowerCase();
  const mimes = getMimeCandidates(file);
  const matches: { format: FileFormat; match: FormatMatch }[] = [];
  for (const format of formats) {
    const match = matchFormat(format, ext, mimes, loose);
    if (match) matches.push({ format, match });
  }
  return matches.toSorted((a, b) => MATCH_ORDER.indexOf(a.match) - MATCH_ORDER.indexOf(b.match));
}

/** The formats a file most likely is: only the best matches found. */
export function detectFormats(file: FileLike, formats: Iterable<FileFormat>): FileFormat[] {
  const matches = detectFormatMatches(file, formats);
  return matches.filter((m) => m.match === matches[0].match).map((m) => m.format);
}
