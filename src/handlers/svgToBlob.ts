import Formats from "src/Formats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import { InitializationError } from "src/errors.ts";
import { changeExt } from "src/common/index.ts";
import { canvasToBlob, createCanvas, resolveSize, type CanvasBundle } from "src/common/canvas.ts";
import type { ConvertContext } from "src/ui/ProgressStore.ts";

class svgToBlobHandler implements FormatHandler {
  public readonly name = "svgToBlob";
  public supportedFormats = [
    Formats.PNG.builder("png").options({ width: true, height: true }).to(),
    Formats.JPEG.builder("jpeg").options({ width: true, height: true, quality: true }).to(),
    Formats.WEBP.builder("webp").options({ width: true, height: true, quality: true }).to(),
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
    convertCtx?: ConvertContext,
  ): Promise<FileData[]> {
    const options = convertCtx?.options;
    const quality = options?.quality;
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

      const { width, height } = resolveSize(image.naturalWidth, image.naturalHeight, options);
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(image, 0, 0, width, height);

      const bytes = await canvasToBlob(
        this.#bundle,
        outputFormat.mime,
        quality === undefined ? undefined : quality / 100,
      );
      const name = changeExt(inputFile.name, outputFormat.extension);

      outputFiles.push({ bytes, name });
    }
    return outputFiles;
  }
}

export default svgToBlobHandler;
