import type { FileData, FileFormat, FormatHandler, ConvertPathNode } from "./FormatHandler.ts";

export type FormatOption = { format: FileFormat; handler: FormatHandler };

export type Leg = {
  files: FileData[];
  path: ConvertPathNode[];
  from: FormatOption;
  to: FormatOption;
};

export type ChainResult = {
  finalFiles: FileData[];
  legs: Leg[];
  failedAt?: number;
};

/**
 * Single-leg conversion primitive — `runChain` is decoupled from the DOM by
 * receiving this as a callback rather than reaching for `window`.
 */
export type SegmentRunner = (
  files: FileData[],
  from: FormatOption,
  to: FormatOption,
  legIndex: number,
  totalLegs: number
) => Promise<{ files: FileData[]; path: ConvertPathNode[] } | null>;

const stripExt = (name: string): string => {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
};

const sameFormat = (a: FormatOption, b: FormatOption): boolean =>
  a.format.mime === b.format.mime && a.format.format === b.format.format;

/**
 * Orchestrates a chained conversion across `[input, ...waypoints, output]`.
 * Each leg is delegated to the supplied {@link SegmentRunner}, which in
 * production is a thin wrapper around `window.tryConvertByTraversing` and in
 * tests can be any function returning fake `FileData`/path data.
 *
 * Each leg's outputs are retained on the returned {@link Leg} so the caller
 * can offer optional intermediate downloads without re-running anything.
 */
export async function runChain(
  initialFiles: FileData[],
  segments: FormatOption[],
  runSegment: SegmentRunner
): Promise<ChainResult> {
  if (segments.length < 2) {
    return { finalFiles: initialFiles, legs: [] };
  }

  let files: FileData[] = initialFiles;
  const legs: Leg[] = [];

  // We may "skip" no-op adjacent segments (input == waypoint), so the legs
  // we actually run can be fewer than segments.length-1. Compute the planned
  // count first so progress messaging is accurate.
  const plannedPairs: Array<{ from: FormatOption; to: FormatOption }> = [];
  for (let i = 0; i < segments.length - 1; i++) {
    if (sameFormat(segments[i], segments[i + 1])) continue;
    plannedPairs.push({ from: segments[i], to: segments[i + 1] });
  }

  for (let i = 0; i < plannedPairs.length; i++) {
    const { from, to } = plannedPairs[i];
    const result = await runSegment(files, from, to, i, plannedPairs.length);
    if (!result) {
      return { finalFiles: files, legs, failedAt: i };
    }
    // Stamp the output extension to match the leg's target format. Most
    // handlers already do this, but keep it consistent for downstream legs
    // and for the optional intermediate-download UX.
    files = result.files.map((f) => ({
      name: stripExt(f.name) + "." + to.format.extension,
      bytes: f.bytes,
    }));
    legs.push({ files, path: result.path, from, to });
  }

  return { finalFiles: files, legs };
}
