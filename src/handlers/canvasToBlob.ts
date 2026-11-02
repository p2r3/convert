import Formats from "src/Formats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import type { ConvertContext } from "../ui/ProgressStore.js";
import { imageToText, rgbaToGrayscale } from "built/image-to-txt/src/convert.ts";
import { InitializationError } from "src/errors.ts";
import {
  blobToCanvas,
  canvasToBlob,
  createCanvas,
  drawWatermark,
  type CanvasBundle,
} from "src/common/canvas.ts";
import { changeExt, decode, encode } from "src/common/index.ts";

class canvasToBlobHandler implements FormatHandler {
  public readonly name = "canvasToBlob";
  public supportedFormats = [
    Formats.PNG.builder("png").lossless().fromTo(),
    Formats.JPEG.builder("jpeg").fromTo(),
    Formats.WEBP.builder("webp").fromTo(),
    Formats.GIF.builder("gif").from(),
    Formats.TEXT.builder("text").fromTo(),
  ];
  public ready = false;

  #bundle?: CanvasBundle;

  async init() {
    this.#bundle = createCanvas();
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
    _args?: string[],
    convertCtx?: ConvertContext,
  ): Promise<FileData[]> {
    if (!this.#bundle) {
      throw new InitializationError("Handler not initialized.");
    }
    const { ctx, canvas } = this.#bundle;
    // a canvas can't write a palette, so this sends the conversion on to ImageMagick
    if (convertCtx?.settings.colors && outputFormat.mime === "image/png") {
      throw new Error("canvasToBlob can't reduce the colours of a PNG.");
    }

    const outputFiles: FileData[] = [];
    for (const inputFile of inputFiles) {
      if (inputFormat.mime === "text/plain") {
        const font = "48px sans-serif";
        const fontSize = parseInt(font);
        const footerPadding = fontSize * 0.5;
        const string = decode(inputFile.bytes);
        const lines = string.split("\n");

        ctx.font = font;

        let maxLineWidth = 0;
        for (const line of lines) {
          const width = ctx.measureText(line).width;
          if (width > maxLineWidth) maxLineWidth = width;
        }

        canvas.width = maxLineWidth;
        canvas.height = Math.floor(fontSize * lines.length + footerPadding);

        if (outputFormat.mime === "image/jpeg") {
          ctx.fillStyle = "white";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.fillStyle = "black";
        ctx.strokeStyle = "white";
        ctx.font = font;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          ctx.fillText(line, 0, fontSize * (i + 1));
          ctx.strokeText(line, 0, fontSize * (i + 1));
        }
      } else {
        await blobToCanvas(
          this.#bundle,
          inputFile.bytes,
          inputFormat.mime,
          convertCtx?.settings.maxSize,
        );
      }

      let bytes: Uint8Array;
      if (outputFormat.mime === "text/plain") {
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        bytes = encode(
          imageToText({
            width() {
              return pixels.width;
            },
            height() {
              return pixels.height;
            },
            getPixel(x: number, y: number) {
              const index = (y * pixels.width + x) * 4;
              return rgbaToGrayscale(
                pixels.data[index] / 255,
                pixels.data[index + 1] / 255,
                pixels.data[index + 2] / 255,
                pixels.data[index + 3] / 255,
              );
            },
          }),
        );
      } else {
        const watermark = convertCtx?.settings.watermark;
        if (watermark) drawWatermark(ctx, canvas.width, canvas.height, watermark);
        bytes = await canvasToBlob(this.#bundle, outputFormat.mime, convertCtx?.settings.quality);
      }

      const name = changeExt(inputFile.name, outputFormat.extension);

      outputFiles.push({ bytes, name });
    }

    return outputFiles;
  }
}

export default canvasToBlobHandler;
