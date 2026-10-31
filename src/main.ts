import {
  type FileFormat,
  type FileData,
  type ConvertPathNode,
  type HandlerDefinition,
} from "./FormatHandler.js";
import { ensureDefinitions, type HandlerName } from "./handlers/index.js";
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

export type ConversionOptionsMap = Map<FileFormat, HandlerDefinition>;
export type ConversionOption = ConversionOptionsMap extends Map<infer K, infer V> ? [K, V] : never;

export const ConversionOptions: ConversionOptionsMap = new Map();

export const SelectedFiles = signal<FileRecord>({});

export function goToUploadHome(): void {
  CurrentPage.value = Pages.Upload;
  SelectedFiles.value = {};
}

window.handlerDefs = [];

// if we dont have offscreencanvas, dont use workers
const nativeWorkerCanvas =
  typeof OffscreenCanvas !== "undefined" &&
  typeof OffscreenCanvas.prototype.transferToImageBitmap === "function";
let useWorkers = false;

async function createGraph() {
  let worker: Worker | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    worker = new TraversionGraphWorker();
    const RemoteGraph = comlink.wrap<typeof TraversionGraph>(worker);
    const graph = await Promise.race([
      new RemoteGraph(),
      new Promise<never>((_, reject) => {
        worker!.addEventListener(
          "error",
          (event) => reject(new Error(event.message || "Module worker unavailable")),
          {
            once: true,
          },
        );
        timeout = setTimeout(() => reject(new Error("Module worker did not start")), 10000);
      }),
    ]);
    useWorkers = true;
    return graph;
  } catch (error) {
    worker?.terminate();
    console.info("Using main-thread conversion fallback", error);
    const { TraversionGraph } = await import("./TraversionGraph.js");
    return new TraversionGraph();
  } finally {
    clearTimeout(timeout);
  }
}

// i dont expect any other pages to exist so location.href works
window.baseUrl = new URL(import.meta.env.BASE_URL, location.href).href;
const converterMain = new Converter("main_thread", window.baseUrl);
const graphReady = createGraph().then((graph) => {
  window.traversionGraph = graph;
});

type ConverterWorkerEntry = { worker: Worker; converter: comlink.Remote<Converter>; name: string };
const converterWorkers: Map<HandlerName, Promise<ConverterWorkerEntry>> = new Map();

async function getOrCreateConversionWorker(handler: HandlerName) {
  let promise = converterWorkers.get(handler);
  if (promise) return promise;
  promise = (async () => {
    if (!window.baseUrl) throw new Error("must have baseurl on window!");
    if (!window.handlerDefs.length) throw new Error("handler defs must be initialized!");

    const worker = new ConverterWorker();
    const RemoteConverter = comlink.wrap<typeof Converter>(worker);
    const name = `web_worker_${handler}`;
    const converter = await new RemoteConverter(name, window.baseUrl);
    await converter.init(window.handlerDefs);
    return { converter, worker, name };
  })();
  promise.catch(() => converterWorkers.delete(handler));
  converterWorkers.set(handler, promise);
  return promise;
}

async function tryKillConversionWorker(handler: HandlerName) {
  const entry = await converterWorkers.get(handler);
  if (!entry) return false;
  converterWorkers.delete(handler);
  entry.worker.terminate();
  console.log(`Terminated ${entry.name}.`);
  return true;
}

window.printSupportedFormatCache = () => {
  return JSON.stringify(window.handlerDefs, null, 2);
};

async function buildOptionList() {
  ConversionOptions.clear();

  await graphReady;
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
    abort.throwIfAborted();

    const handlerDef = path[i + 1].handler;
    const channel = new MessageChannel();
    const sendAbort = () => channel.port1.postMessage("abort");
    abort.addEventListener("abort", sendAbort, { once: true });

    try {
      const converter =
        handlerDef.offload !== false && useWorkers && nativeWorkerCanvas
          ? (await getOrCreateConversionWorker(handlerDef.name)).converter
          : converterMain;

      console.log(`Chose converter ${await converter.name} for ${handlerDef.name}`);

      abort.throwIfAborted();

      const convert = (files: FileData[]) =>
        converter.doConvert(
          handlerDef,
          [path[i], path[i + 1]],
          comlink.transfer(files, [...new Set([...files].map((file) => file.bytes.buffer))]),
          { currentStep: i + 1, totalSteps },
          comlink.proxy(ProgressStore),
          comlink.transfer(channel.port2, [channel.port2]),
        );

      let result;
      if (handlerDef.abortable) {
        // lend
        // this is annoying
        const restore = originalFiles.map((original) => ({
          original,
          inputIndex: files.findIndex((file) => file.bytes.buffer === original.bytes.buffer),
          offset: original.bytes.byteOffset,
          length: original.bytes.byteLength,
        }));

        result = await convert(files);

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
      } else {
        // copy
        if (files.some((f) => originalFiles.some((o) => o.bytes.buffer === f.bytes.buffer)))
          files = structuredClone(files);

        const { promise: aborter, resolve } = Promise.withResolvers<"aborted">();

        const abortAborter = () => resolve("aborted");
        abort.addEventListener("abort", abortAborter, { once: true });

        result = await Promise.race([convert(files), aborter]);

        abort.removeEventListener("abort", abortAborter);

        if (result === "aborted") {
          // if its on a worker, kill it. otherwise, rekt
          tryKillConversionWorker(handlerDef.name);

          throw new DOMException("This operation was aborted", "AbortError");
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
) {
  deadEndAttempts = [];
  abort ??= ProgressStore.controller.signal;
  await window.traversionGraph.clearDeadEndPaths();
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
    const attempt = await attemptConvertPath(files, path, abort);
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
