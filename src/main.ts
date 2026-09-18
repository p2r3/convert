import {
  type FileFormat,
  type FileData,
  type FormatHandler,
  type ConvertPathNode,
  stripFormat,
  stripHandler,
  stripPathNode,
} from "./FormatHandler.js";
import handlers from "./handlers/index.js";
import * as comlink from "comlink";
import type { TraversionGraph } from "./TraversionGraph.js";
import TraversionGraphWorker from "./TraversionGraph.js?worker";
import { Converter } from "./Converter.js";
import ConverterWorker from "./Converter.js?worker";
import { CurrentPage, LoadingToolsText, Pages } from "./ui/AppState.js";
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

export const ConversionsFromAnyInput: ConvertPathNode[] = handlers
  .filter((h) => h.supportAnyInput && h.supportedFormats)
  .flatMap((h) => h.supportedFormats!.filter((f) => f.to).map((f) => ({ handler: h, format: f })));

window.supportedFormatCache = new Map();

const RemoteConverter = comlink.wrap<typeof Converter>(new ConverterWorker());
const RemoteTraversionGraph = comlink.wrap<typeof TraversionGraph>(new TraversionGraphWorker());

const converterWorker = await new RemoteConverter("web_worker");
const converterMain = new Converter("main_thread");
window.traversionGraph = await new RemoteTraversionGraph();

window.printSupportedFormatCache = () => {
  const entries = [];
  for (const entry of window.supportedFormatCache) entries.push(entry);
  return JSON.stringify(entries, null, 2);
};

async function buildOptionList() {
  ConversionOptions.clear();

  for (const handler of handlers) {
    if (!window.supportedFormatCache.has(handler.name)) {
      console.warn(`Cache miss for formats of handler "${handler.name}"`);

      try {
        await handler.init();
      } catch (error) {
        console.error(`Error while initializing ${handler.name}:`, error);
        continue;
      }

      if (handler.supportedFormats) {
        window.supportedFormatCache.set(
          handler.name,
          handler.supportedFormats.map((format) => stripFormat(format)),
        );
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
  }

  await window.traversionGraph.init(
    window.supportedFormatCache,
    handlers.map((handler) => stripHandler(handler)),
  );

  converterMain.init(window.supportedFormatCache);
  await converterWorker.init(window.supportedFormatCache);

  LoadingToolsText.value = undefined;
}

let deadEndAttempts: ConvertPathNode[][];

async function attemptConvertPath(
  originalFiles: FileData[],
  path: ConvertPathNode[],
  abort?: AbortSignal,
) {
  const pathString = path.map((c) => c.format.format).join(" → ");

  for (const deadEnd of deadEndAttempts) {
    let isDeadEnd = true;
    for (let i = 0; i < deadEnd.length; i++) {
      if (
        path[i]?.handler.name === deadEnd[i].handler.name &&
        path[i]?.format.mime === deadEnd[i].format.mime &&
        path[i]?.format.format === deadEnd[i].format.format
      )
        continue;
      isDeadEnd = false;
      break;
    }
    if (isDeadEnd) {
      const deadEndString = deadEnd
        .slice(-2)
        .map((c) => c.format.format)
        .join(" → ");
      console.warn(`Skipping ${pathString} due to dead end near ${deadEndString}.`);
      return null;
    }
  }

  ProgressStore.progress(`Trying ${pathString}...`, 0);

  let files = originalFiles;

  const totalSteps = path.length - 1;
  for (let i = 0; i < path.length - 1; i++) {
    if (!abort) abort = ProgressStore.controller.signal;
    if (abort.aborted) return null;

    const handlerDef = path[i + 1].handler;
    const channel = new MessageChannel();
    const sendAbort = () => channel.port1.postMessage("abort");
    abort.addEventListener("abort", sendAbort, { once: true });

    try {
      const converter = handlerDef.offload ? converterWorker : converterMain;

      console.log(`Chose converter ${await converter.name} for ${handlerDef.name}`);

      abort.throwIfAborted();

      // this is annoying
      const restore = originalFiles.map((original) => ({
        original,
        inputIndex: files.findIndex((file) => file.bytes.buffer === original.bytes.buffer),
        offset: original.bytes.byteOffset,
        length: original.bytes.byteLength,
      }));

      const result = await converter.doConvert(
        handlerDef,
        [path[i], path[i + 1]],
        comlink.transfer(files, [...new Set([...files].map((file) => file.bytes.buffer))]),
        { currentStep: i + 1, totalSteps },
        comlink.proxy(ProgressStore),
        comlink.transfer(channel.port2, [channel.port2]),
      );

      for (const { original, inputIndex, offset, length } of restore) {
        if (inputIndex !== -1) {
          // we dont want handlers messing with it but we need to mess with it
          (original as { bytes: Uint8Array }).bytes = new Uint8Array(
            result.inputFiles[inputIndex].bytes.buffer,
            offset,
            length,
          );
        }
      }

      if (result.ok) {
        files = result.outputFiles;
      } else {
        throw Object.assign(new Error(result.error.message), result.error);
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        throw e;
      }

      abort.throwIfAborted();

      console.log(path.map((c) => c.format.format));
      console.error(handlerDef.name, `${path[i].format.format} → ${path[i + 1].format.format}`, e);

      const deadEndPath = path.slice(0, i + 2);
      deadEndAttempts.push(deadEndPath);
      await window.traversionGraph.addDeadEndPath(path.slice(0, i + 2));

      ProgressStore.progress("Looking for a valid path...", 0);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      return null;
    } finally {
      abort.removeEventListener("abort", sendAbort);
      channel.port1.close();
      channel.port2.close();
    }
  }

  return { files, path };
}

window.tryConvertByTraversing = async function (
  files: FileData[],
  from: ConvertPathNode,
  to: ConvertPathNode,
  abort?: AbortSignal,
) {
  deadEndAttempts = [];
  await window.traversionGraph.clearDeadEndPaths();
  const paths = await window.traversionGraph.searchPathProxied(
    stripPathNode(from),
    stripPathNode(to),
    Mode.value === ModeEnum.Simple,
  );
  while (true) {
    const { value: path, done } = await paths.next();
    if (done) return null;
    if (abort?.aborted) return null;
    if (path.at(-1)?.handler === to.handler) {
      path[path.length - 1] = to;
    }
    const attempt = await attemptConvertPath(files, path, abort);
    if (attempt) return attempt;
  }
};

async function initSupportedFormats() {
  try {
    try {
      const cacheJSON = await fetch("cache.json").then((r) => r.json());
      window.supportedFormatCache = new Map(cacheJSON);
    } catch {
      console.warn(
        "Missing supported format precache.\n\n" +
          "Consider saving the output of printSupportedFormatCache() to cache.json.",
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
