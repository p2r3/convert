import * as comlink from "comlink";
import type {
  ConvertPathNode,
  FileData,
  FileFormat,
  FormatHandler,
  HandlerDefinition,
} from "./FormatHandler";
import { createRemoteContext, type IProgressStore } from "./ui/ProgressStore";

if (!("window" in globalThis)) {
  (globalThis as unknown as { window: typeof globalThis }).window = globalThis;
}

type ConvertResult = { inputFiles: FileData[] } & (
  | {
      ok: false;
      error: {
        name: string;
        stack?: string;
        message: string;
      };
    }
  | { ok: true; outputFiles: FileData[] }
);

export class Converter {
  public name: string;
  private supportedFormatCache?: Map<string, FileFormat[]>;
  private handlers?: FormatHandler[];

  public constructor(name: string) {
    this.name = name;
  }

  public async init(supportedFormatCache: Map<string, FileFormat[]>) {
    console.log(`Initializing converter ${this.name}...`);
    this.supportedFormatCache = supportedFormatCache;
    this.handlers = (await import("./handlers/index")).default;
    console.log(`Converter ${this.name} ready.`);
  }

  public async doConvert(
    handlerDef: HandlerDefinition,
    path: [ConvertPathNode, ConvertPathNode],
    inputFiles: FileData[],
    { currentStep, totalSteps }: { currentStep: number; totalSteps: number },
    progressStore: IProgressStore,
    abortPort: MessagePort,
  ): Promise<ConvertResult> {
    const controller = new AbortController();
    abortPort.addEventListener("message", ({ data }) => {
      if (data === "abort") controller.abort();
    });
    abortPort.start();

    const ctx = createRemoteContext(progressStore, handlerDef.name, controller.signal);

    try {
      if (!this.supportedFormatCache || !this.handlers) throw new Error("Converter not ready.");
      const handler = this.handlers.find((handler) => handler.name === handlerDef.name);
      if (!handler) throw new Error(`Handler "${handlerDef.name}" not found.`);

      const supportedFormats = this.supportedFormatCache.get(handler.name);

      if (!supportedFormats)
        throw new Error(`Handler "${handler.name}" doesn't support any formats.`);

      const inputFormat =
        supportedFormats.find(
          (c) => c.from && c.mime === path[0].format.mime && c.format === path[0].format.format,
        ) || (handler.supportAnyInput ? path[0].format : undefined);

      if (!inputFormat)
        throw new Error(
          `Handler "${handler.name}" doesn't support the "${path[0].format.format}" format.`,
        );

      if (!handler.ready) {
        ctx.log(`Initializing ${handler.name}...`);
        await handler.init();
        if (!handler.ready) throw new Error(`Handler "${handler.name}" not ready after init.`);
      }

      ctx.log(
        `Converting ${path[0].format.format} → ${path[1].format.format} using ${this.name} converter`,
      );
      ctx.progress(
        `${handler.name}: ${path[0].format.format} → ${path[1].format.format}`,
        (currentStep - 1) / totalSteps,
      );

      const outputFiles = (
        await Promise.all([
          handler.doConvert(inputFiles, inputFormat, path[1].format, undefined, ctx),
          new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        ])
      )[0];

      ctx.log(`Step ${currentStep}/${totalSteps} complete`);
      if (outputFiles.some((c) => !c.bytes.length)) throw "Output is empty.";

      return comlink.transfer({ ok: true, inputFiles, outputFiles }, [
        ...new Set([...inputFiles, ...outputFiles].map((file) => file.bytes.buffer)),
      ]);
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      return comlink.transfer(
        {
          ok: false,
          inputFiles,
          error: {
            name: error.name,
            message: error.message,
            stack: error.stack,
          },
        },
        [...new Set([...inputFiles].map((file) => file.bytes.buffer))],
      );
    } finally {
      abortPort.close();
    }
  }
}

if (typeof document === "undefined") comlink.expose(Converter);
