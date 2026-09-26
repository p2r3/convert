import CommonFormats from "src/CommonFormats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import { imageToText, rgbaToGrayscale } from "built/image-to-txt/src/convert.ts";
import { InitializationError } from "src/errors.ts";

class canvasToBlobHandler implements FormatHandler {
  public name: string = "canvasToBlob";

  public supportedFormats: FileFormat[] = [
    CommonFormats.PNG.supported("png", true, true, true),
    CommonFormats.JPEG.supported("jpeg", true, true),
    CommonFormats.WEBP.supported("webp", true, true),
    CommonFormats.GIF.supported("gif", true, false),
    CommonFormats.TEXT.supported("text", true, true),
  ];

  #canvas?: OffscreenCanvas;
  #ctx?: OffscreenCanvasRenderingContext2D;

  public ready: boolean = false;
  public offload: boolean = true;

  async init() {
    this.#canvas = new OffscreenCanvas(1, 1);
    this.#ctx = this.#canvas.getContext("2d") || undefined;
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {
    if (!this.#canvas || !this.#ctx) {
      throw new InitializationError("Handler not initialized.");
    }

    const outputFiles: FileData[] = [];
    for (const inputFile of inputFiles) {
      if (inputFormat.mime === "text/plain") {
        const font = "48px sans-serif";
        const fontSize = parseInt(font);
        const footerPadding = fontSize * 0.5;
        const string = new TextDecoder().decode(inputFile.bytes);
        const lines = string.split("\n");

        this.#ctx.font = font;

        let maxLineWidth = 0;
        for (const line of lines) {
          const width = this.#ctx.measureText(line).width;
          if (width > maxLineWidth) maxLineWidth = width;
        }

        this.#canvas.width = maxLineWidth;
        this.#canvas.height = Math.floor(fontSize * lines.length + footerPadding);

        if (outputFormat.mime === "image/jpeg") {
          this.#ctx.fillStyle = "white";
          this.#ctx.fillRect(0, 0, this.#canvas.width, this.#canvas.height);
        }
        this.#ctx.fillStyle = "black";
        this.#ctx.strokeStyle = "white";
        this.#ctx.font = font;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          this.#ctx.fillText(line, 0, fontSize * (i + 1));
          this.#ctx.strokeText(line, 0, fontSize * (i + 1));
        }
      } else {
        const blob = new Blob([inputFile.bytes as BlobPart], { type: inputFormat.mime });

        const image = await createImageBitmap(blob);

        this.#canvas.width = image.width;
        this.#canvas.height = image.height;
        this.#ctx.drawImage(image, 0, 0);
      }

      let bytes: Uint8Array;
      if (outputFormat.mime === "text/plain") {
        const pixels = this.#ctx.getImageData(0, 0, this.#canvas.width, this.#canvas.height);
        bytes = new TextEncoder().encode(
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
        const blob = await this.#canvas.convertToBlob({
          type: outputFormat.mime,
        });
        bytes = new Uint8Array(await blob.arrayBuffer());
      }

      const name = inputFile.name.split(".").slice(0, -1).join(".") + "." + outputFormat.extension;

      outputFiles.push({ bytes, name });
    }

    return outputFiles;
  }
}

export default canvasToBlobHandler;
