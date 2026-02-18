import CommonFormats from "src/CommonFormats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

import { QOIDecoder, QOIEncoder } from "qoi-fu";

class qoiFuHandler implements FormatHandler {

  public name: string = "qoi-fu";
  public supportedFormats: FileFormat[] = [
    CommonFormats.PNG.supported("png", true, true, true),
    CommonFormats.JPEG.supported("jpeg", true, true),
    CommonFormats.WEBP.supported("webp", true, true),
    CommonFormats.GIF.supported("gif", true, false),
    CommonFormats.SVG.supported("svg", true, false),
    {
      name: "Quite OK Image",
      format: "qoi",
      extension: "qoi",
      mime: "image/x-qoi",
      from: true,
      to: true,
      internal: "qoi",
      category: "image",
      lossless: true
    }
  ];
  public ready: boolean = false;

  #canvas?: HTMLCanvasElement;
  #ctx?: CanvasRenderingContext2D;

  async init () {
    this.#canvas = document.createElement("canvas");
    const ctx = this.#canvas.getContext("2d");
    if (!ctx) throw "Failed to create 2D rendering context.";
    this.#ctx = ctx;
    this.ready = true;
  }

  static rgbaToArgb (rgba: Uint8ClampedArray): Int32Array {
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
  static argbToRgba (argb: Int32Array): Uint8ClampedArray {
    const rgba = new Uint8ClampedArray(argb.length * 4);

    for (let i = 0; i < argb.length; i++) {
      const pixel = argb[i];
      const offset = i * 4;

      rgba[offset] = (pixel >> 16) & 0xFF;     // R
      rgba[offset + 1] = (pixel >> 8) & 0xFF;  // G
      rgba[offset + 2] = pixel & 0xFF;         // B
      rgba[offset + 3] = (pixel >> 24) & 0xFF; // A
    }

    return rgba;
  }

  async doConvert (
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {

    if (!this.#canvas || !this.#ctx) {
      throw "Handler not initialized.";
    }

    const outputFiles: FileData[] = [];

    const inputIsQOI = (inputFormat.internal === "qoi");
    const outputIsQOI = (outputFormat.internal === "qoi");

    if (inputIsQOI === outputIsQOI) {
      throw "Invalid input/output format.";
    }

    if (outputIsQOI) {
      for (const inputFile of inputFiles) {

        this.#ctx.clearRect(0, 0, this.#canvas.width, this.#canvas.width);

        const blob = new Blob([inputFile.bytes as BlobPart], { type: inputFormat.mime });
        const url = URL.createObjectURL(blob);

        const image = new Image();
        await new Promise((resolve, reject) => {
          image.addEventListener("load", resolve);
          image.addEventListener("error", reject);
          image.src = url;
        });

        const width = image.naturalWidth;
        const height = image.naturalHeight;

        this.#canvas.width = width;
        this.#canvas.height = height;
        this.#ctx.drawImage(image, 0, 0);

        const imageData = this.#ctx.getImageData(0, 0, width, height);
        const pixelBuffer = qoiFuHandler.rgbaToArgb(imageData.data);

        const qoiEncoder = new QOIEncoder();
        const success = qoiEncoder.encode(width, height, pixelBuffer, true, false);
        if (!success) throw `Failed to encode QOI image "${inputFile.name}".`;

        const bytesSize = qoiEncoder.getEncodedSize();
        const bytes = new Uint8Array(qoiEncoder.getEncoded().slice(0, bytesSize));

        const name = inputFile.name.split(".")[0] + "." + outputFormat.extension;
        outputFiles.push({ bytes, name });

      }
    } else {
      for (const inputFile of inputFiles) {

        const qoiDecoder = new QOIDecoder();
        const success = qoiDecoder.decode(inputFile.bytes, inputFile.bytes.length);
        if (!success) throw `Failed to decode QOI image "${inputFile.name}".`;

        const width = qoiDecoder.getWidth();
        const height = qoiDecoder.getHeight();
        const colorSpace = qoiDecoder.isLinearColorspace() ? "display-p3" : "srgb";
        const pixelBuffer = qoiFuHandler.argbToRgba(qoiDecoder.getPixels());

        const imageData = new ImageData(pixelBuffer as ImageDataArray, width, height, {
          colorSpace: colorSpace
        });

        this.#canvas.width = width;
        this.#canvas.height = height;
        this.#ctx.putImageData(imageData, 0, 0);

        const bytes: Uint8Array = await new Promise((resolve, reject) => {
          this.#canvas!.toBlob((blob) => {
            if (!blob) return reject("Canvas output failed.");
            blob.arrayBuffer().then(buf => resolve(new Uint8Array(buf)));
          }, outputFormat.mime);
        });
        const name = inputFile.name.split(".")[0] + "." + outputFormat.extension;
        outputFiles.push({ bytes, name });

      }
    }

    return outputFiles;
  }

}

export default qoiFuHandler;
