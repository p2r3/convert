import type { FileData } from "src/FormatHandler";
import { filePath } from "src/common/path.ts";

export type DownloadMode = "separate" | "zip" | "tar";

export const ARCHIVE_THRESHOLD = 10;

export function defaultDownloadMode(count: number): DownloadMode {
  return count > ARCHIVE_THRESHOLD ? "zip" : "separate";
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function uniquePaths(files: FileData[]): string[] {
  const seen = new Set<string>();
  return files.map((file) => {
    const full = filePath(file);
    let name = full;
    for (let i = 1; seen.has(name); i++) {
      const dot = full.lastIndexOf(".");
      name =
        dot > full.lastIndexOf("/")
          ? `${full.slice(0, dot)} (${i})${full.slice(dot)}`
          : `${full} (${i})`;
    }
    seen.add(name);
    return name;
  });
}

export async function downloadFiles(files: FileData[], mode: DownloadMode, archiveName: string) {
  if (mode === "separate") {
    for (const file of files) {
      saveBlob(
        new Blob([file.bytes], { type: "application/octet-stream" }),
        filePath(file).replaceAll("/", "_"),
      );
    }
    return;
  }

  const paths = uniquePaths(files);
  if (mode === "zip") {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    files.forEach((file, i) => zip.file(paths[i], file.bytes));
    const blob = await zip.generateAsync({ type: "blob", mimeType: "application/zip" });
    saveBlob(blob, `${archiveName}.zip`);
  } else {
    const { createTar } = await import("nanotar");
    const tar = createTar(files.map((file, i) => ({ name: paths[i], data: file.bytes })));
    saveBlob(new Blob([new Uint8Array(tar)], { type: "application/x-tar" }), `${archiveName}.tar`);
  }
}
