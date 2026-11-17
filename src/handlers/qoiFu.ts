import Formats from "src/Formats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

import { QOIDecoder, QOIEncoder } from "qoi-fu";

import { InitializationError } from "src/errors.ts";
import { changeExt } from "src/common/index.ts";
import { blobToCanvas, canvasToBlob, createCanvas, type CanvasBundle } from "src/common/canvas.ts";

class qoiFuHandler implements FormatHandler {
  public readonly name = "qoiFu";
  public supportedFormats = [
    Formats.PNG.builder("png").lossless().fromTo(),
    Formats.JPEG.builder("jpeg").fromTo(),
    Formats.WEBP.builder("webp").fromTo(),
    Formats.GIF.builder("gif").from(),
    Formats.QOI.builder("qoi").lossless().fromTo(),
  ];
  public ready = false;

  #bundle?: CanvasBundle;

  async init() {
    this.#bundle = createCanvas();
    this.ready = true;
  }

  static rgbaToArgb(rgba: Uint8ClampedArray): Int32Array {
    const length = rgba.length / 4;
    const argb = new Int32Array(length);

    for (let i = 0; i < length; i++) {
      const offset = i * 4;
      const r = rgba[offset];
      const g = rgba[offset + 1];
      const b = rgba[offset + 2];
      const a = rgba[offset + 3];

      argb[i] = (a << 24) | (r << 16) | (g << 8) | b;
    }

    return argb;
  }
  static argbToRgba(argb: Int32Array): Uint8ClampedArray<ArrayBuffer> {
    const rgba = new Uint8ClampedArray(argb.length * 4);

    for (let i = 0; i < argb.length; i++) {
      const pixel = argb[i];
      const offset = i * 4;

      rgba[offset] = (pixel >> 16) & 0xff; // R
      rgba[offset + 1] = (pixel >> 8) & 0xff; // G
      rgba[offset + 2] = pixel & 0xff; // B
      rgba[offset + 3] = (pixel >> 24) & 0xff; // A
    }

    return rgba;
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

    const inputIsQOI = inputFormat.internal === "qoi";
    const outputIsQOI = outputFormat.internal === "qoi";

    if (inputIsQOI === outputIsQOI) {
      throw new TypeError(
        `Unsupported conversion path: ${inputFormat.internal} -> ${outputFormat.internal}`,
      );
    }

    if (outputIsQOI) {
      for (const inputFile of inputFiles) {
        await blobToCanvas(this.#bundle, inputFile.bytes, inputFormat.mime);

        const width = canvas.width;
        const height = canvas.height;

        const imageData = ctx.getImageData(0, 0, width, height);
        const pixelBuffer = qoiFuHandler.rgbaToArgb(imageData.data);

        const qoiEncoder = new QOIEncoder();
        const success = qoiEncoder.encode(width, height, pixelBuffer, true, false);
        if (!success) throw new Error(`Failed to encode QOI image "${inputFile.name}".`);

        const bytesSize = qoiEncoder.getEncodedSize();
        const bytes = new Uint8Array(qoiEncoder.getEncoded().slice(0, bytesSize));

        const name = changeExt(inputFile.name, outputFormat.extension);
        outputFiles.push({ bytes, name });
      }
    } else {
      for (const inputFile of inputFiles) {
        const qoiDecoder = new QOIDecoder();
        const success = qoiDecoder.decode(inputFile.bytes, inputFile.bytes.length);
        if (!success) throw new Error(`Failed to decode QOI image "${inputFile.name}".`);

        const width = qoiDecoder.getWidth();
        const height = qoiDecoder.getHeight();
        const colorSpace = qoiDecoder.isLinearColorspace() ? "display-p3" : "srgb";
        const pixelBuffer = qoiFuHandler.argbToRgba(qoiDecoder.getPixels());

        const imageData = new ImageData(pixelBuffer, width, height, {
          colorSpace: colorSpace,
        });

        canvas.width = width;
        canvas.height = height;
        ctx.putImageData(imageData, 0, 0);

        const bytes = await canvasToBlob(this.#bundle, outputFormat.mime);
        const name = changeExt(inputFile.name, outputFormat.extension);
        outputFiles.push({ bytes, name });
      }
    }

    return outputFiles;
  }
}

export default qoiFuHandler;
