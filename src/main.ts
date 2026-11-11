import {
  type FileFormat,
  type FileData,
  type ConvertPathNode,
  type HandlerDefinition,
  formatIdentifier,
  sameFormat,
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
import { detectFormats } from "./detectFormat.js";
import { SpecialFormats } from "./Formats.js";
import { distributeOptions, type ConvertOptions } from "./Settings.js";

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
      if (!format.mime || format.mime === SpecialFormats.ANY.mime) continue;
      ConversionOptions.set(format, handler);
    }
  }

  await window.traversionGraph.init(window.handlerDefs);

  converterMain.init(window.handlerDefs);

  LoadingToolsText.value = undefined;
}

let deadEndAttempts: ConvertPathNode[][];

/** Remembers that `path` fails, so neither this run nor the graph tries it again. */
async function markDeadEnd(path: ConvertPathNode[]) {
  deadEndAttempts.push(path);
  await window.traversionGraph.addDeadEndPath(path);
  ProgressStore.progress("Looking for a valid path...", 0);
}

/** How many times a single conversion may go through SpecialFormats.ANY. */
const MAX_ANY_DEPTH = 4;

/** Identifiers of the known formats a file most likely is. */
const detectFormatIds = (file: FileData) => [
  ...new Set(detectFormats(file, ConversionOptions.keys()).map(formatIdentifier)),
];

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
        sameFormat(path[i]?.format, deadEnd[i].format)
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

      await markDeadEnd(path.slice(0, i + 2));
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

const totalBytes = (files: FileData[]) => files.reduce((sum, file) => sum + file.bytes.length, 0);

/** Whether some handler accepts SpecialFormats.ANY and directly outputs `format`, e.g. packing into a zip. */
const acceptsAnyInto = (format: FileFormat) =>
  window.handlerDefs.some(
    (handler) =>
      handler.supportedFormats?.some((f) => f.from && sameFormat(f, SpecialFormats.ANY)) &&
      handler.supportedFormats.some((f) => f.to && sameFormat(f, format)),
  );

/**
 * Ranks the ways to continue with the files produced by a SpecialFormats.ANY step, best first.
 */
async function rankAnyOutputCandidates(
  files: FileData[],
  step: ConvertPathNode,
  to: ConvertPathNode,
) {
  const costs = await window.traversionGraph.getFormatCosts(to.format, "from");
  const knownCosts = await window.traversionGraph.getFormatCosts(to.format, "from", false);
  const targetId = formatIdentifier(to.format);
  const tier = (id: string) => (id === targetId ? 0 : knownCosts.has(id) ? 1 : 2);

  const groups = new Map<string, FileData[]>();
  for (const file of files) {
    for (const id of detectFormatIds(file)) {
      if (!costs.has(id)) continue;
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id)!.push(file);
    }
  }

  const ranked = [...groups]
    .toSorted(
      ([idA, a], [idB, b]) =>
        tier(idA) - tier(idB) ||
        b.length - a.length ||
        totalBytes(b) - totalBytes(a) ||
        costs.get(idA)! - costs.get(idB)!,
    )
    .map(([id, group]) => {
      const options = [...ConversionOptions].filter(([format]) => formatIdentifier(format) === id);
      const [format, handler] = options.find(([format]) => format.from) ?? options[0];
      return { node: { handler, format } as ConvertPathNode, files: group, passOn: false };
    });

  if (!knownCosts.has(formatIdentifier(SpecialFormats.ANY))) return ranked;
  const passOn = { node: step, files, passOn: true };
  return acceptsAnyInto(to.format) ? [passOn, ...ranked] : [...ranked, passOn];
}

/**
 * Continues a path that ended at SpecialFormats.ANY: detects what the step produced and tries
 * each way to continue, best first, by searching again from there.
 */
async function continueFromAny(
  files: FileData[],
  path: ConvertPathNode[],
  to: ConvertPathNode,
  abort: AbortSignal,
  depth: number,
  settings: ConvertOptions,
  strict: boolean,
) {
  const step = path.at(-1)!;
  const candidates = await rankAnyOutputCandidates(files, step, to);
  if (!candidates.length) {
    const found = [...new Set(files.flatMap(detectFormatIds))];
    ProgressStore.log(
      `${step.handler.name} produced nothing convertible to ${to.format.format} (found: ${found.join(", ") || "nothing recognizable"}), rerouting.`,
      "warn",
      step.handler.name,
    );
    await markDeadEnd(path);
    return null;
  }

  for (const group of candidates) {
    // Groups replace the ANY step with their real format; passing on keeps it.
    const prefix = group.passOn
      ? path
      : path.slice(0, -1).concat({ handler: step.handler, format: group.node.format });
    let result = null;
    if (sameFormat(group.node.format, to.format)) {
      result = { files: group.files, path: prefix };
    } else {
      const rest = await searchAndConvert(
        group.files,
        group.node,
        to,
        abort,
        depth + 1,
        settings,
        strict,
      );
      if (rest) result = { files: rest.files, path: prefix.concat(rest.path.slice(1)) };
    }
    if (!result) {
      ProgressStore.log(
        `Could not convert the extracted ${group.passOn ? "" : group.node.format.format + " "}files, trying the next option.`,
        "warn",
        step.handler.name,
      );
      continue;
    }
    if (group.files.length < files.length) {
      ProgressStore.log(
        `Used ${group.files.length} ${group.node.format.format} file(s), dropped ${files.length - group.files.length} other file(s).`,
        "warn",
        step.handler.name,
      );
    }
    return result;
  }

  ProgressStore.log(
    `None of the files extracted by ${step.handler.name} could be converted, rerouting.`,
    "warn",
    step.handler.name,
  );
  await markDeadEnd(path);
  return null;
}

async function searchAndConvert(
  files: FileData[],
  from: ConvertPathNode,
  to: ConvertPathNode,
  abort: AbortSignal,
  depth: number,
  settings: ConvertOptions,
  strict: boolean,
): Promise<{ files: FileData[]; path: ConvertPathNode[] } | null> {
  const paths = await window.traversionGraph.searchPathProxied(
    from,
    to,
    Mode.value === ModeEnum.Simple,
    comlink.proxy(() => abort.aborted),
    strict ? Object.keys(settings) : [],
  );
  while (true) {
    const { value: path, done } = await paths.next();
    abort.throwIfAborted();
    if (done) return null;
    const openEnded = path.at(-1)!.format.mime === SpecialFormats.ANY.mime;
    if (openEnded && depth >= MAX_ANY_DEPTH) continue;
    if (!openEnded && path.at(-1)?.handler.name === to.handler.name) {
      path[path.length - 1] = to;
    }
    if (openEnded) {
      // The settings are for the real output, which the rest of the path produces.
      const attempt = await attemptConvertPath(files, path, abort);
      if (!attempt) continue;
      const result = await continueFromAny(attempt.files, path, to, abort, depth, settings, strict);
      if (result) return result;
      continue;
    }
    const distributed = distributeOptions(path, settings);
    const attempt = await attemptConvertPath(files, distributed.path, abort);
    if (!attempt) continue;
    if (distributed.unsupported.length) {
      ProgressStore.log(
        `No step of this conversion supports ${distributed.unsupported.join(", ")}, so ${distributed.unsupported.length === 1 ? "it was" : "they were"} ignored.`,
        "warn",
      );
    }
    return attempt;
  }
}

window.tryConvertByTraversing = async function (
  files: FileData[],
  from: ConvertPathNode,
  to: ConvertPathNode,
  abort?: AbortSignal,
  settings: ConvertOptions = {},
) {
  deadEndAttempts = [];
  abort ??= ProgressStore.controller.signal;
  await window.traversionGraph.clearDeadEndPaths();
  if (!Object.keys(settings).length) return searchAndConvert(files, from, to, abort, 0, {}, false);

  // First only take paths that honour every setting, then settle for whatever converts.
  try {
    const result = await searchAndConvert(files, from, to, abort, 0, settings, true);
    if (result) return result;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw e;
    abort.throwIfAborted();
    console.warn(e);
  }
  ProgressStore.log(
    "Could not find a conversion that supports all of the chosen settings, trying without that requirement.",
    "warn",
  );
  // A step may only have failed because of its options.
  deadEndAttempts = [];
  await window.traversionGraph.clearDeadEndPaths();
  return searchAndConvert(files, from, to, abort, 0, settings, false);
};

/**
 * Converts along a path the user built themselves, with the options they set on each node.
 * Nothing is rerouted: if a step fails, the conversion fails.
 */
window.tryConvertByPath = async function (
  files: FileData[],
  path: ConvertPathNode[],
  abort?: AbortSignal,
) {
  deadEndAttempts = [];
  abort ??= ProgressStore.controller.signal;
  try {
    return await attemptConvertPath(files, path, abort);
  } finally {
    // attemptConvertPath marks failures as dead ends, which only matter when searching.
    await window.traversionGraph.clearDeadEndPaths();
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
