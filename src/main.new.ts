import type { FileFormat, FileData, FormatHandler, ConvertPathNode } from "./FormatHandler.js";
import normalizeMimeType from "./normalizeMimeType.js";
import handlers from "./handlers";
import { TraversionGraph } from "./TraversionGraph.js";
import { PopupData } from "./ui/index.js";
import { closePopup, openPopup } from "./ui/PopupStore.js";
import { signal } from "@preact/signals";

/** KV pairs of files */
type FileRecord = Record<`${string}-${string}`, File>

/** Map of available formats and its handler */
type ConversionOptionsMap = Map<FileFormat, FormatHandler>;

export const ConversionOptions: ConversionOptionsMap = new Map();

/**
 * Files currently selected for conversion
 */
export const SelectedFiles = signal<FileRecord>({});

/**
 * Whether to use "simple" mode
 * - In **simple** mode, the input/output lists are grouped by file format.
 * - In **advanced** mode, these lists are grouped by format handlers, which
 *   requires the user to manually select the tool that processes the output.
 */
export let SimpleMode: boolean = true;
/**
 * Setter for `SimpleMode`
 * @param val Value to input
 */
export function setSimpleMode(val: boolean) { SimpleMode = val }

/**
 * Handlers that support conversion from any formats
 */
export const ConversionsFromAnyInput: ConvertPathNode[] =
	handlers
		.filter(h => h.supportAnyInput && h.supportedFormats)
		.flatMap(h => h.supportedFormats!
			.filter(f => f.to)
			.map(f => ({ handler: h, format: f })));

window.supportedFormatCache = new Map();
window.traversionGraph = new TraversionGraph();

window.printSupportedFormatCache = () => {
	const entries = [];
	for (const entry of window.supportedFormatCache)
		entries.push(entry);
	return JSON.stringify(entries, null, 2);
}

async function buildOptionList() {
	ConversionOptions.clear();

	for (const handler of handlers) {
		if (!window.supportedFormatCache.has(handler.name)) {
			console.warn(`Cache miss for formats of handler "${handler.name}"`);

			try {
				await handler.init();
			} catch (_) { continue }

			if (handler.supportedFormats) {
				window.supportedFormatCache.set(handler.name, handler.supportedFormats);
				console.info(`Updated supported format cache for "${handler.name}"`);
			}
		}

		const supportedFormats = window.supportedFormatCache.get(handler.name);

		if (!supportedFormats) {
			console.warn(`Handler "${handler.name}" doesn't support any formats`);
			continue
		}

		for (const format of supportedFormats) {
			if (!format.mime) continue;
			ConversionOptions.set(format, handler);
		}
	}

	closePopup();
}

async function attemptConvertPath(files: FileData[], path: ConvertPathNode[]) {
	PopupData.value = {
		title: "Finding conversion route...",
		text: `Trying ${path.map(c => c.format.format).join(" → ")}`
	}
	openPopup();

	for (let i = 0; i < path.length - 1; i++) {
		const handler = path[i + 1].handler;

		try {
			let supportedFormats = window.supportedFormatCache.get(handler.name);

			if (!handler.ready) {
				try {
					await handler.init();
				} catch (_) { return null; }

				if (handler.supportedFormats) {
					window.supportedFormatCache.set(handler.name, handler.supportedFormats);
					supportedFormats = handler.supportedFormats;
				}
			}

			if (!supportedFormats) throw `Handler "${handler.name}" doesn't support any formats.`;

			const inputFormat = supportedFormats.find(c => c.mime === path[i].format.mime && c.from)!;

			files = (
				await Promise.all([
					handler.doConvert(files, inputFormat, path[i + 1].format),
					// Ensure that we wait long enough for the UI to update
					new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
				])
			)[0];

			if (files.some(c => !c.bytes.length)) throw "Output is empty.";
		} catch (e) {
			console.log(path.map(c => c.format.format));
			console.error(handler.name, `${path[i].format.format} → ${path[i + 1].format.format}`, e);

			await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
			return null;
		}
	}
}

window.tryConvertByTraversing = async function (
	files: FileData[],
	from: ConvertPathNode,
	to: ConvertPathNode
) {
	for await (const path of window.traversionGraph.searchPath(from, to, SimpleMode)) {
		// Use exact output format if the target handler supports it
		if (path.at(-1)?.handler === to.handler) {
			path[path.length - 1] = to;
		}
		const attempt = await attemptConvertPath(files, path);
		if (attempt) return attempt;
	}
	return null;
}

function downloadFile(bytes: Uint8Array, name: string, mime: string) {
	const blob = new Blob([bytes as BlobPart], { type: mime });
	const link = document.createElement("a");
	link.href = URL.createObjectURL(blob);
	link.download = name;
	link.click();
}

try {
	const cacheJSON = await fetch("cache.json")
		.then(r => r.json());
	window.supportedFormatCache = new Map(cacheJSON);
} catch (error) {
	console.warn(
		"Missing supported format precache.\n\n" +
		"Consider saving the output of printSupportedFormatCache() to cache.json."
	);
} finally {
	await buildOptionList();
	console.log("Built initial format list.");
}

console.debug(ConversionOptions);
