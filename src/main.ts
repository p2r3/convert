import {
  type FileFormat,
  type FileData,
  type ConvertPathNode,
  type HandlerDefinition,
} from "./FormatHandler.js";
import { ensureDefinitions } from "./handlers/index.js";
import * as comlink from "comlink";
import type { TraversionGraph } from "./TraversionGraph.js";
import TraversionGraphWorker from "./TraversionGraph.js?worker";
import { Converter } from "./Converter.js";
import ConverterWorker from "./Converter.js?worker";
import { CurrentPage, LoadingToolsText, Pages } from "./ui/AppState.js";
import { signal } from "@preact/signals";
import { Mode, ModeEnum } from "./ui/ModeStore.js";
import { ProgressStore } from "./ui/ProgressStore.js";
import {
  altersContent,
  compressorsFor,
  sameFormat,
  type ConversionSettings,
} from "./ConversionSettings.js";
import { keepSmaller } from "./batch.js";
import { Settings, ZipPassword } from "./ui/components/ConversionSettings/index.js";

type FileRecord = Record<`${string}-${string}`, File>;

export type ConversionOptionsMap = Map<FileFormat, HandlerDefinition>;
export type ConversionOption = ConversionOptionsMap extends Map<infer K, infer V> ? [K, V] : never;

export const ConversionOptions: ConversionOptionsMap = new Map();

export const SelectedFiles = signal<FileRecord>({});

/**
 * Replaces (or appends to) the selected files and opens the conversion page.
 * @returns Whether the selection was accepted.
 */
export function selectFiles(newFiles: File[], append: boolean = false): boolean {
  if (newFiles.length === 0) return false;
  const files = append ? [...Object.values(SelectedFiles.value), ...newFiles] : newFiles;
  if (!append) {
    // settings from a previous selection shouldn't silently apply to a new one
    Settings.value = {};
    ZipPassword.value = "";
  }

  SelectedFiles.value = Object.fromEntries(
    files.map((file) => [`${file.name}-${file.lastModified}`, file]),
  );
  CurrentPage.value = Pages.Conversion;
  return true;
}

export function goToUploadHome(): void {
  CurrentPage.value = Pages.Upload;
  SelectedFiles.value = {};
}

window.handlerDefs = [];

const RemoteConverter = comlink.wrap<typeof Converter>(new ConverterWorker());
const RemoteTraversionGraph = comlink.wrap<typeof TraversionGraph>(new TraversionGraphWorker());

// i dont expect any other pages to exist so location.href works
window.baseUrl = new URL(import.meta.env.BASE_URL, location.href).href;
const converterWorker = await new RemoteConverter("web_worker", window.baseUrl);
const converterMain = new Converter("main_thread", window.baseUrl);
window.traversionGraph = await new RemoteTraversionGraph();

window.printSupportedFormatCache = () => {
  return JSON.stringify(window.handlerDefs, null, 2);
};

async function buildOptionList() {
  ConversionOptions.clear();

  await ensureDefinitions(window.handlerDefs);

  for (const handler of window.handlerDefs) {
    if (!handler.supportedFormats) {
      console.warn(`Handler "${handler.name}" doesn't support any formats`);
      continue;
    }

    for (const format of handler.supportedFormats) {
      if (!format.mime) continue;
      ConversionOptions.set(format, handler);
    }
  }

  await window.traversionGraph.init(window.handlerDefs);

  converterMain.init(window.handlerDefs);
  await converterWorker.init(window.handlerDefs);

  LoadingToolsText.value = undefined;
}

let deadEndAttempts: ConvertPathNode[][];

async function attemptConvertPath(
  originalFiles: FileData[],
  path: ConvertPathNode[],
  abort?: AbortSignal,
  settings?: ConversionSettings,
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
    abort.throwIfAborted();

    const handlerDef = path[i + 1].handler;
    const channel = new MessageChannel();
    const sendAbort = () => channel.port1.postMessage("abort");
    abort.addEventListener("abort", sendAbort, { once: true });

    try {
      const converter = handlerDef.offload !== false ? converterWorker : converterMain;

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
        // intermediate files shouldn't be degraded by the user's output settings
        i === totalSteps - 1 ? settings : undefined,
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

      ProgressStore.log(
        `Conversion path failed: ${pathString} (${handlerDef.name}: ${path[i].format.format} → ${path[i + 1].format.format}): ${e instanceof Error ? e.message : String(e)}`,
        "error",
        handlerDef.name,
      );

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
  settings?: ConversionSettings,
) {
  deadEndAttempts = [];
  abort ??= ProgressStore.controller.signal;
  await window.traversionGraph.clearDeadEndPaths();

  // the graph has no edge from a format to itself, so compressing takes a direct route
  if (sameFormat(from.format, to.format)) {
    for (const [format, handler] of compressorsFor(to.format, window.handlerDefs)) {
      const attempt = await attemptConvertPath(files, [from, { format, handler }], abort, settings);
      if (!attempt) continue;
      // handlers name outputs after their own extension, which would turn photo.jpg into photo.jpeg
      if (attempt.files.length === files.length) {
        attempt.files = attempt.files.map((file, i) => ({ ...file, name: files[i].name }));
      }
      // a "compressed" file that grew is worse than the original
      if (!altersContent(settings ?? {})) attempt.files = keepSmaller(files, attempt.files);
      return attempt;
    }
    return null;
  }

  const paths = await window.traversionGraph.searchPathProxied(
    from,
    to,
    Mode.value === ModeEnum.Simple,
    comlink.proxy(() => abort.aborted),
  );
  while (true) {
    const { value: path, done } = await paths.next();
    abort.throwIfAborted();
    if (done) return null;
    if (path.at(-1)?.handler.name === to.handler.name) {
      path[path.length - 1] = to;
    }
    const attempt = await attemptConvertPath(files, path, abort, settings);
    if (attempt) return attempt;
  }
};

async function initSupportedFormats() {
  try {
    try {
      window.handlerDefs = await fetch("cache.json").then((r) => r.json());
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
