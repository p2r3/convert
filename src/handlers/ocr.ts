import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import { FormatDefinition } from "../FormatHandler.ts";
import Formats, { Category } from "src/Formats.ts";
import type { ConvertContext } from "src/ui/ProgressStore.ts";
import { changeExt, encode } from "src/common/index.ts";

// its own format, because PNG to plain text already exists and means ASCII art
const OCR_TEXT = new FormatDefinition(
  "Recognised text (OCR, English and Dutch)",
  "ocr",
  "txt",
  "text/plain",
  Category.TEXT,
);

class ocrHandler implements FormatHandler {
  public readonly name = "ocr";
  public supportedFormats = [Formats.PNG.builder("png").from(), OCR_TEXT.builder("ocr").to()];
  public ready = false;

  async init() {
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    _inputFormat: FileFormat,
    _outputFormat: FileFormat,
    _args?: string[],
    ctx?: ConvertContext,
  ): Promise<FileData[]> {
    const { createWorker, OEM } = await import("tesseract.js");
    // copied there by vite.config.js; tesseract.js would otherwise fetch all three from a CDN
    const assets = new URL("external/tesseract/", globalThis.baseUrl).href;
    let fileIndex = 0;
    const worker = await createWorker("eng+nld", OEM.LSTM_ONLY, {
      workerPath: `${assets}worker.min.js`,
      corePath: assets,
      langPath: assets,
      // the default wraps the worker in a blob that calls importScripts, which adds nothing here
      workerBlobURL: false,
      logger: ({ status, progress }) => {
        if (status === "recognizing text") {
          ctx?.progress("Recognising text...", (fileIndex + progress) / inputFiles.length);
        }
      },
    });

    try {
      const outputFiles: FileData[] = [];
      for (const file of inputFiles) {
        ctx?.throwIfAborted();
        const { data } = await worker.recognize(new Blob([file.bytes as BlobPart]));
        // an empty output counts as a failed conversion, and a blank page is not a failure
        outputFiles.push({ name: changeExt(file.name, "txt"), bytes: encode(data.text || "\n") });
        fileIndex++;
      }
      return outputFiles;
    } finally {
      await worker.terminate();
    }
  }
}

export default ocrHandler;
