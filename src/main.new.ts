import type { FileFormat, FileData, FormatHandler, ConvertPathNode } from "./FormatHandler.js";
import handlers from "./handlers";
import { TraversionGraph } from "./TraversionGraph.js";
import { getOptionValues, initializeHandlerOptions } from "./HandlerOptions.js";
import { CurrentPage, LoadingToolsText, Pages, PopupData } from "./ui/AppState.js";
import { signal } from "@preact/signals";
import { Mode, ModeEnum } from "./ui/ModeStore.js";
import { ProgressStore } from "./ui/ProgressStore.js";

type FileRecord = Record<`${string}-${string}`, File>;

export type ConversionOptionsMap = Map<FileFormat, FormatHandler>;
export type ConversionOption = ConversionOptionsMap extends Map<infer K, infer V> ? [K, V] : never;

export const ConversionOptions: ConversionOptionsMap = new Map();

export const SelectedFiles = signal<FileRecord>({});

export function goToUploadHome(): void {
	CurrentPage.value = Pages.Upload;
	SelectedFiles.value = {};
}

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
};

async function buildOptionList() {
	ConversionOptions.clear();

	const totalHandlers = handlers.length;
	let loadedCount = 0;

	for (const handler of handlers) {
		LoadingToolsText.value = `Loading ${handler.name} (${loadedCount}/${totalHandlers}, ${ConversionOptions.size} formats)…`;

		if (!window.supportedFormatCache.has(handler.name)) {
			console.warn(`Cache miss for formats of handler "${handler.name}"`);

			try {
				await handler.init();
			} catch (_) { continue; }

			if (handler.supportedFormats) {
				window.supportedFormatCache.set(handler.name, handler.supportedFormats);
				console.info(`Updated supported format cache for "${handler.name}"`);
			}
		}

		const supportedFormats = window.supportedFormatCache.get(handler.name);

		if (!supportedFormats) {
			console.warn(`Handler "${handler.name}" doesn't support any formats`);
			continue;
		}

		for (const format of supportedFormats) {
			if (!format.mime) continue;
			ConversionOptions.set(format, handler);
		}

		loadedCount++;
	}

	window.traversionGraph.init(window.supportedFormatCache, handlers);
	LoadingToolsText.value = undefined;
}

let deadEndAttempts: ConvertPathNode[][];

interface RouteConstraints {
	forceInputHandler?: boolean;
	forceOutputHandler?: boolean;
	inputHandlerName?: string;
	outputHandlerName?: string;
}

async function attemptConvertPath(files: FileData[], path: ConvertPathNode[], signal?: AbortSignal) {
	const pathString = path.map(c => c.format.format).join(" → ");

	for (const deadEnd of deadEndAttempts) {
		let isDeadEnd = true;
		for (let i = 0; i < deadEnd.length; i++) {
			if (path[i] === deadEnd[i]) continue;
			isDeadEnd = false;
			break;
		}
		if (isDeadEnd) {
			const deadEndString = deadEnd.slice(-2).map(c => c.format.format).join(" → ");
			console.warn(`Skipping ${pathString} due to dead end near ${deadEndString}.`);
			return null;
		}
	}

	ProgressStore.progress(`Trying ${pathString}...`, 0);

	const totalSteps = path.length - 1;
	for (let i = 0; i < path.length - 1; i++) {
		if (signal?.aborted) return null;

		const handler = path[i + 1].handler;
		const ctx = ProgressStore.createContext(handler.name, signal);

		try {
			let supportedFormats = window.supportedFormatCache.get(handler.name);

			if (!handler.ready) {
				ctx.log(`Initializing ${handler.name}...`);
				await handler.init();
				if (!handler.ready) throw `Handler "${handler.name}" not ready after init.`;
				if (handler.supportedFormats) {
					window.supportedFormatCache.set(handler.name, handler.supportedFormats);
					supportedFormats = handler.supportedFormats;
				}
			}

			if (!supportedFormats) throw `Handler "${handler.name}" doesn't support any formats.`;

			const inputFormat = supportedFormats.find(c =>
				c.from
				&& c.mime === path[i].format.mime
				&& c.format === path[i].format.format
			) || (handler.supportAnyInput ? path[i].format : undefined);

			if (!inputFormat) throw `Handler "${handler.name}" doesn't support the "${path[i].format.format}" format.`;

			ctx.log(`Plugin call: ${handler.name} | from=${path[i].format.format} (${path[i].format.mime}) | to=${path[i + 1].format.format} (${path[i + 1].format.mime})`);
			ctx.log(`Plugin options: ${JSON.stringify(getOptionValues(handler))}`, "debug");
			ctx.log(`Converting ${path[i].format.format} → ${path[i + 1].format.format}`);
			ProgressStore.progress(`${handler.name}: ${path[i].format.format} → ${path[i + 1].format.format}`, i / totalSteps);

			files = (await Promise.all([
				handler.doConvert(files, inputFormat, path[i + 1].format, undefined, ctx),
				new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
			]))[0];

			ctx.log(`Plugin done: ${handler.name} | from=${path[i].format.format} (${path[i].format.mime}) | to=${path[i + 1].format.format} (${path[i + 1].format.mime})`);
			ctx.log(`Step ${i + 1}/${totalSteps} complete`);
			if (files.some(c => !c.bytes.length)) throw "Output is empty.";
		} catch (e) {
			if (e instanceof DOMException && e.name === "AbortError") {
				throw e;
			}

			console.log(path.map(c => c.format.format));
			console.error(handler.name, `${path[i].format.format} → ${path[i + 1].format.format}`, e);

			const deadEndPath = path.slice(0, i + 2);
			deadEndAttempts.push(deadEndPath);
			window.traversionGraph.addDeadEndPath(path.slice(0, i + 2));

			ctx.log(`Dead end: ${path[i].format.format} → ${path[i + 1].format.format}`);
			ProgressStore.progress("Looking for a valid path...", 0);
			await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
			
			return null;
		}
	}

	ProgressStore.logs.value = [
		...ProgressStore.logs.value,
		{
			timestamp: Date.now(),
			plugin: "Router",
			message: `Route done: ${path.map(c => `${c.handler.name}:${c.format.format}`).join(" -> ")}`,
			level: "log"
		}
	];
	return { files, path };
}

window.tryConvertByTraversing = async function (
	files: FileData[],
	from: ConvertPathNode,
	to: ConvertPathNode,
	signal?: AbortSignal,
	constraints?: RouteConstraints
) {
	deadEndAttempts = [];
	window.traversionGraph.clearDeadEndPaths();
	const simpleMode = Mode.value === ModeEnum.Simple;
	let searchedPaths = 0;
	for await (const path of window.traversionGraph.searchPath(from, to, simpleMode, (iterations, title) => {
		ProgressStore.progress(title ?? `Finding route... (Checked ${iterations} paths)`, 0);
	})) {
		searchedPaths++;
		if (searchedPaths % 8 === 0) {
			ProgressStore.progress(`Finding route... (Checked ${searchedPaths} paths)`, 0);
		}
		if (signal?.aborted) return null;
		if (path.at(-1)?.handler.name === to.handler.name) {
			path[path.length - 1] = to;
		}
		const attempt = await attemptConvertPath(files, path, signal);
		if (attempt) return attempt;
	}
	return null;
};

window.previewConvertPath = async function (
	from: ConvertPathNode,
	to: ConvertPathNode,
	simpleMode: boolean,
	constraints?: RouteConstraints
) {
	for await (const path of window.traversionGraph.searchPath(from, to, simpleMode, () => {})) {
		if (path.at(-1)?.handler.name === to.handler.name) {
			path[path.length - 1] = to;
		}
		return path;
	}
	return null;
};

export function downloadFile(bytes: Uint8Array, name: string, mime: string) {
	const blob = new Blob([bytes as BlobPart], { type: mime });
	const link = document.createElement("a");
	link.href = URL.createObjectURL(blob);
	link.download = name;
	link.click();
}

async function initSupportedFormats() {
	try {
		initializeHandlerOptions(handlers);
		try {
			const cacheJSON = await fetch("cache.json").then(r => r.json());
			window.supportedFormatCache = new Map(cacheJSON);
		} catch {
			console.warn(
				"Missing supported format precache.\n\n" +
				"Consider saving the output of printSupportedFormatCache() to cache.json."
			);
		}
		await buildOptionList();
		console.log("Built initial format list.");
	} catch (e) {
		console.error(e);
		LoadingToolsText.value = "Could not load formats.";
	}
}

void initSupportedFormats();

console.debug(ConversionOptions);
