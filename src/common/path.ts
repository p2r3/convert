import { stripExt } from "./index.ts";

/** Joins path segments with `/`, skipping empty ones. */
export function joinPath(...parts: (string | undefined)[]): string {
  return parts.filter(Boolean).join("/");
}

/** The path of a file inside its container, folders included: `path/name`. */
export function filePath(file: { name: string; path?: string }): string {
  return joinPath(file.path, file.name);
}

/**
 * Splits a container entry path into a file name and folder for `FileData`.
 * Accepts `\` separators and drops empty, `.` and `..` segments.
 * @param parent Folder to put the entry in, e.g. from {@link extractedParent}.
 */
export function splitPath(entryPath: string, parent?: string): { name: string; path?: string } {
  const parts = entryPath.split(/[\\/]/).filter((p) => p && p !== "." && p !== "..");
  const name = parts.pop() ?? entryPath;
  const path = joinPath(parent, ...parts);
  return path ? { name, path } : { name };
}

/**
 * Folder to extract an archive's entries into: next to the archive itself, and in a
 * folder named after it when several archives are extracted together.
 */
export function extractedParent(
  archive: { name: string; path?: string },
  multiple: boolean,
): string | undefined {
  return joinPath(archive.path, multiple ? stripExt(archive.name) : undefined) || undefined;
}
