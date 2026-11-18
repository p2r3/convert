import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

import Formats from "src/Formats.ts";
import { InitializationError } from "src/errors.ts";
import { canvasToBlob, createCanvas, type CanvasBundle } from "src/common/canvas.ts";

class xcursorHandler implements FormatHandler {
  public readonly name = "xcursor";
  public supportedFormats = [
    Formats.PNG.builder("png").lossless().to(),
    Formats.JPEG.builder("jpeg").to(),
    Formats.XCUR.builder("xcur").lossless().from(),
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
  ): Promise<FileData[]> {
    if (!this.ready || !this.#bundle) {
      throw new InitializationError("Handler not initialized.");
    }
    const { canvas, ctx } = this.#bundle;
    if (
      inputFormat.internal !== "xcur" ||
      outputFormat.internal === "xcur" ||
      inputFormat.internal === outputFormat.internal
    ) {
      throw new TypeError(
        `Unsupported conversion path: ${inputFormat.internal} -> ${outputFormat.internal}`,
      );
    }

    const outputFiles: FileData[] = [];

    for (const inputFile of inputFiles) {
      const view = new DataView(
        inputFile.bytes.buffer,
        inputFile.bytes.byteOffset,
        inputFile.bytes.byteLength,
      );

      const magic = Array.from(inputFile.bytes.slice(0, 4))
        .map((c) => String.fromCharCode(c))
        .join("");
      if (magic !== "Xcur") {
        console.error("File is not an X11 cursor.");
        continue;
      }

      // Table of contents
      const tocLength = view.getUint32(12, true);
      for (let i = 0; i < tocLength; i++) {
        // Entry type (skip if not image)
        const type = view.getUint32(16 + i * 12, true);
        if (type !== 0xfffd0002) continue;

        // Image Offset into file
        const offset = view.getUint32(16 + i * 12 + 8, true);

        const width = view.getUint32(offset + 16, true);
        const height = view.getUint32(offset + 20, true);
        // TODO: Implement CUR output?
        const _xHot = view.getUint32(offset + 24, true);
        const _yHot = view.getUint32(offset + 28, true);

        const source = inputFile.bytes.subarray(offset + 36, offset + 36 + width * height * 4);
        const pixels = new Uint8ClampedArray(width * height * 4);
        for (let p = 0; p + 3 < source.length; p += 4) {
          const a = source[p + 3];
          const unpremultiply = (c: number) => (a === 0 ? 0 : Math.round((c * 255) / a));
          pixels[p] = unpremultiply(source[p + 2]);
          pixels[p + 1] = unpremultiply(source[p + 1]);
          pixels[p + 2] = unpremultiply(source[p]);
          pixels[p + 3] = a;
        }

        canvas.width = width;
        canvas.height = height;

        const imageData = new ImageData(pixels, width, height);
        ctx.putImageData(imageData, 0, 0);

        const bytes = await canvasToBlob(this.#bundle, outputFormat.mime);
        const name = `${inputFile.name}_${i}.${outputFormat.extension}`;
        outputFiles.push({ bytes, name });
      }
    }

    return outputFiles;
  }
}

export default xcursorHandler;
