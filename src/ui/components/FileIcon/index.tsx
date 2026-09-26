import { useEffect, useState } from "preact/hooks";
import iconsUrl from "built/material-icons/icons.json?url";
import { getDefaultIconForCategory } from "./categoryDefaultIcons";
import "./index.css";

interface FileIconProps {
  extension?: string;
  mimeType?: string;
  category?: string | string[];
  size?: number;
  className?: string;
}

interface IconBundle {
  extensions: Record<string, string>;
  icons: Record<string, string>;
}

let bundleCache: IconBundle | null = null;
let loadPromise: Promise<IconBundle> | null = null;

function loadIconBundle(): Promise<IconBundle> {
  if (bundleCache) return Promise.resolve(bundleCache);
  if (!loadPromise) {
    loadPromise = fetch(iconsUrl)
      .then((r) => {
        if (!r.ok) throw new Error("icon bundle load failed");
        return r.json() as Promise<IconBundle>;
      })
      .then((bundle) => {
        bundleCache = bundle;
        return bundle;
      });
  }
  return loadPromise;
}

function normalizeExt(extension?: string): string | undefined {
  if (!extension) return undefined;
  return extension.toLowerCase().replace(/^\./, "");
}

function lookupLogical(ext: string | undefined, map: Record<string, string> | null): string {
  if (!ext || !map) return "file";
  const e = normalizeExt(ext) ?? "";
  if (map[e]) return map[e];
  let cur = e;
  while (cur.includes(".")) {
    if (map[cur]) return map[cur];
    cur = cur.slice(cur.indexOf(".") + 1);
  }
  return map[cur] ?? "file";
}

function mimeFallbackLogical(mimeType?: string): string {
  if (!mimeType) return "file";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("font/")) return "font";
  if (mimeType.startsWith("text/")) return "document";
  if (mimeType.includes("zip") || mimeType.includes("archive") || mimeType.includes("compressed")) {
    return "zip";
  }
  if (mimeType.includes("json")) return "json";
  return "file";
}

function resolveLogical(
  extension: string | undefined,
  mimeType: string | undefined,
  map: Record<string, string> | null,
  category: string | string[] | undefined,
): string {
  let logical = "file";
  if (extension !== undefined && extension !== "") {
    logical = lookupLogical(extension, map);
  }
  if (logical === "file" && mimeType !== undefined && mimeType !== "") {
    logical = mimeFallbackLogical(mimeType);
  }
  if (logical !== "file") return logical;
  return getDefaultIconForCategory(category);
}

/** Renders a Material Icon Theme file icon from extension or MIME type. */
export default function FileIcon({
  extension,
  mimeType,
  category,
  size = 20,
  className = "",
}: FileIconProps) {
  const [bundle, setBundle] = useState<IconBundle | null>(bundleCache);

  useEffect(() => {
    loadIconBundle().then(setBundle);
  }, []);

  const logical = resolveLogical(extension, mimeType, bundle?.extensions ?? null, category);
  const svg = bundle?.icons[logical] ?? bundle?.icons.file;

  return (
    <div
      className={`file-icon ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
      // this is safe cuz it comes from the server
      dangerouslySetInnerHTML={{ __html: svg ?? "" }}
    />
  );
}
