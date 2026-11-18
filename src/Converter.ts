import "./polyfills.ts";
import * as comlink from "comlink";
import {
  sameFormat,
  type ConvertPathNode,
  type FileData,
  type HandlerDefinition,
} from "./FormatHandler";
import { SpecialFormats } from "./Formats";
import { createPortProgressStore, createRemoteContext } from "./ui/ProgressStore";
import { getHandler } from "./handlers/index.js";
import { sanitizeOptions } from "./Settings";

if (!("window" in globalThis)) {
  Object.defineProperty(globalThis, "window", {
    value: globalThis,
    writable: true,
    configurable: true,
  });
}

export class Converter {
  public name: string;
  private defs?: HandlerDefinition[];

  public constructor(name: string, baseUrl: string) {
    this.name = name;
    globalThis.baseUrl = baseUrl;
  }

  public init(defs: HandlerDefinition[]) {
    console.log(`Initializing converter ${this.name}...`);
    this.defs = defs;
    console.log(`Converter ${this.name} ready.`);
  }

  public async doConvert(
    handlerDef: HandlerDefinition,
    path: [ConvertPathNode, ConvertPathNode],
    inputFiles: FileData[],
    { currentStep, totalSteps }: { currentStep: number; totalSteps: number },
    port: MessagePort,
  ): Promise<FileData[]> {
    const controller = new AbortController();
    port.addEventListener("message", ({ data }) => {
      if (data === "abort") controller.abort();
    });
    port.start();

    const ctx = createRemoteContext(
      createPortProgressStore(port),
      handlerDef.name,
      controller.signal,
    );

    try {
      if (!this.defs) throw new Error("Converter not ready.");
      const def = this.defs.find((handler) => handler.name === handlerDef.name);
      if (!def) throw new Error(`Handler "${handlerDef.name}" not found.`);

      if (!def.supportedFormats)
        throw new Error(`Handler "${def.name}" doesn't support any formats.`);

      const inputFormat =
        def.supportedFormats.find((c) => c.from && sameFormat(c, path[0].format)) ??
        (def.supportedFormats.some((c) => c.from && sameFormat(c, SpecialFormats.ANY))
          ? path[0].format
          : undefined);

      if (!inputFormat)
        throw new Error(
          `Handler "${def.name}" doesn't support the "${path[0].format.format}" format.`,
        );

      const outputFormat =
        def.supportedFormats.find(
          (c) => c.to && sameFormat(c, path[1].format) && c.internal === path[1].format.internal,
        ) ?? path[1].format;
      ctx.options = sanitizeOptions(outputFormat, path[1].options);
      const dropped = Object.keys(path[1].options ?? {}).filter((key) => !(key in ctx.options));
      if (dropped.length)
        ctx.log(
          `${def.name} can't apply ${dropped.join(", ")} when converting to ${outputFormat.format}, ignoring.`,
          "warn",
        );

      const handler = await getHandler(def.name);

      if (!handler.ready) {
        ctx.log(`Initializing ${def.name}...`);
        await handler.init();
        if (!handler.ready) throw new Error(`Handler "${def.name}" not ready after init.`);
      }
      await ctx.checkpoint();

      ctx.log(
        `Converting ${path[0].format.format} → ${path[1].format.format} using ${this.name} converter`,
      );
      ctx.progress(
        `${def.name}: ${path[0].format.format} → ${path[1].format.format}`,
        (currentStep - 1) / totalSteps,
      );

      let outputFiles = await handler.doConvert(inputFiles, inputFormat, path[1].format, ctx);

      // guess the folders
      if (
        outputFiles.length === inputFiles.length &&
        inputFiles.some((f) => f.path) &&
        !outputFiles.some((f) => f.path)
      ) {
        outputFiles = outputFiles.map((f, i) =>
          inputFiles[i].path ? { ...f, path: inputFiles[i].path } : f,
        );
      }

      ctx.log(`Step ${currentStep}/${totalSteps} complete`);
      if (outputFiles.some((c) => !c.bytes.length)) throw "Output is empty.";
      if (inputFiles.length !== 0 && outputFiles.length === 0)
        throw new Error("No files produced.");

      return comlink.transfer(outputFiles, [
        ...new Set([...outputFiles].map((file) => file.bytes.buffer)),
      ]);
    } finally {
      port.close();
    }
  }
}

if (typeof document === "undefined") comlink.expose(Converter);
