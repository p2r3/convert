import { useEffect, useState } from "preact/hooks";
import { getDefaultIconForCategory } from "./categoryDefaultIcons";
import "./index.css";

interface FileIconProps {
	extension?: string;
	mimeType?: string;
	category?: string | string[];
	size?: number;
	className?: string;
}

let mapCache: Record<string, string> | null = null;
let loadPromise: Promise<Record<string, string>> | null = null;

function loadExtensionMap(): Promise<Record<string, string>> {
	if (mapCache) return Promise.resolve(mapCache);
	if (!loadPromise) {
		loadPromise = fetch(
			`${import.meta.env.BASE_URL}material-file-icons/extension-map.json`,
		)
			.then((r) => {
				if (!r.ok) throw new Error("extension-map load failed");
				return r.json() as Promise<Record<string, string>>;
			})
			.then((m) => {
				mapCache = m;
				return m;
			});
	}
	return loadPromise;
}

function normalizeExt(extension?: string): string | undefined {
	if (!extension) return undefined;
	return extension.toLowerCase().replace(/^\./, "");
}

function lookupLogical(
	ext: string | undefined,
	map: Record<string, string> | null,
): string {
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
	if (
		mimeType.includes("zip") ||
		mimeType.includes("archive") ||
		mimeType.includes("compressed")
	) {
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
	const [map, setMap] = useState<Record<string, string> | null>(mapCache);

	useEffect(() => {
		loadExtensionMap().then(setMap);
	}, []);

	const logical = resolveLogical(extension, mimeType, map, category);

	const src = `${import.meta.env.BASE_URL}material-file-icons/icons/${logical}.svg`;

	return (
		<div
			className={`file-icon ${className}`}
			style={{ width: size, height: size }}
		>
			<img src={src} alt="" width={size} height={size} decoding="async" />
		</div>
	);
}
