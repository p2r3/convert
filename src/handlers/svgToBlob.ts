import Formats from "src/Formats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import { InitializationError } from "src/errors.ts";
import { changeExt } from "src/common/index.ts";
import { canvasToBlob, createCanvas, type CanvasBundle } from "src/common/canvas.ts";

class svgToBlobHandler implements FormatHandler {
  public readonly name = "svgToBlob";
  public supportedFormats = [
    Formats.PNG.builder("png").to(),
    Formats.JPEG.builder("jpeg").to(),
    Formats.WEBP.builder("webp").to(),
    Formats.SVG.builder("svg").from(),
  ];
  public ready = false;
  public offload = false; // svg does not like createImageBitmap

  #bundle?: CanvasBundle;

  async init() {
    this.ready = true;
    this.#bundle = createCanvas();
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {
    if (!this.#bundle) {
      throw new InitializationError("Handler not initialized.");
    }
    const { canvas, ctx } = this.#bundle;

    const outputFiles: FileData[] = [];
    for (const inputFile of inputFiles) {
      // avoid the "Tainted canvases may not be exported" error
      const url = `data:${inputFormat.mime};base64,${inputFile.bytes.toBase64()}`;

      const image = new Image();
      await new Promise((resolve, reject) => {
        image.addEventListener("load", resolve);
        image.addEventListener("error", reject);
        image.src = url;
      });

      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      ctx.drawImage(image, 0, 0);

      const bytes = await canvasToBlob(this.#bundle, outputFormat.mime);
      const name = changeExt(inputFile.name, outputFormat.extension);

      outputFiles.push({ bytes, name });
    }
    return outputFiles;
  }
}

export default svgToBlobHandler;
