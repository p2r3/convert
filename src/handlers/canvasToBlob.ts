import CommonFormats from "src/CommonFormats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import { imageToText, rgbaToGrayscale } from "./image-to-txt/src/convert.ts";

class canvasToBlobHandler implements FormatHandler {

  public name: string = "canvasToBlob";

  public supportedFormats: FileFormat[] = [
    CommonFormats.PNG.supported("png", true, true, true),
    CommonFormats.JPEG.supported("jpeg", true, true),
    CommonFormats.WEBP.supported("webp", true, true),
    CommonFormats.GIF.supported("gif", true, false),
    CommonFormats.SVG.supported("svg", true, false),
    CommonFormats.TEXT.supported("text", true, true)
  ];

  #canvas?: HTMLCanvasElement;
  #ctx?: CanvasRenderingContext2D;

  public ready: boolean = false;

  async init() {
    this.#canvas = document.createElement("canvas");
    this.#ctx = this.#canvas.getContext("2d") || undefined;
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {

    if (!this.#canvas || !this.#ctx) {
      throw "Handler not initialized.";
    }

    const outputFiles: FileData[] = [];
    for (const inputFile of inputFiles) {

      if (inputFormat.mime === "text/plain") {

        const font = "48px sans-serif";
        const fontSize = parseInt(font, 10);
        const footerPadding = fontSize * 0.5;
        const string = new TextDecoder().decode(inputFile.bytes);
        const allLines = string.split("\n");

        this.#ctx.font = font; // Set font to measure text

        const MAX_CANVAS_HEIGHT = 16000;
        const LINES_PER_PAGE = Math.floor((MAX_CANVAS_HEIGHT - footerPadding) / fontSize);

        for (let page = 0; page < Math.ceil(allLines.length / LINES_PER_PAGE); page++) {
          const startLine = page * LINES_PER_PAGE;
          const endLine = Math.min(startLine + LINES_PER_PAGE, allLines.length);
          const lines = allLines.slice(startLine, endLine);

          let maxLineWidth = 0;
          for (const line of lines) {
            const width = this.#ctx.measureText(line).width;
            if (width > maxLineWidth) maxLineWidth = width;
          }

          // Ensure minimum dimensions
          const minWidth = 1;
          const minHeight = 1;
          this.#canvas.width = Math.max(minWidth, maxLineWidth);
          this.#canvas.height = Math.max(minHeight, Math.floor(fontSize * lines.length + footerPadding));

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

          const baseName = inputFile.name.split(".")[0];
          const pageSuffix = Math.ceil(allLines.length / LINES_PER_PAGE) > 1 ? `_page${page + 1}` : "";
          const name = baseName + pageSuffix + "." + outputFormat.extension;

          let bytes: Uint8Array;
          // Convert the current page's canvas to bytes

          const mime = outputFormat.mime;
          const quality = mime === "image/jpeg" ? 0.92 : undefined;

          try {
            bytes = await new Promise<Uint8Array>((resolve, reject) => {
              this.#canvas!.toBlob((blob) => {
                if (!blob) {
                  const sizeInfo = `${this.#canvas!.width}x${this.#canvas!.height}`;
                  return reject(new Error(`Canvas output failed for ${mime}. Size: ${sizeInfo}.`));
                }
                blob.arrayBuffer().then(buf => resolve(new Uint8Array(buf)));
              }, mime, quality);
            });
          } catch (e) {
            console.error(e);
            throw e;
          }

          outputFiles.push({ bytes, name });
        }

        // Continue to next inputFile
        continue;


      } else {

        const blob = new Blob([inputFile.bytes as BlobPart], { type: inputFormat.mime });
        // For SVG, convert to data URL to avoid "Tainted canvases may not be exported" error
        const url =
          inputFormat.mime === "image/svg+xml"
            ? `data:${inputFormat.mime};base64,${btoa(String.fromCharCode(...inputFile.bytes))}`
            : URL.createObjectURL(blob);

        const image = new Image();
        await new Promise((resolve, reject) => {
          image.addEventListener("load", resolve);
          image.addEventListener("error", reject);
          image.src = url;
        });

        this.#canvas.width = image.naturalWidth;
        this.#canvas.height = image.naturalHeight;
        this.#ctx.drawImage(image, 0, 0);

      }

      let bytes: Uint8Array;
      if (outputFormat.mime == "text/plain") {
        const pixels = this.#ctx.getImageData(0, 0, this.#canvas.width, this.#canvas.height);
        bytes = new TextEncoder().encode(imageToText({
          width() { return pixels.width; },
          height() { return pixels.height; },
          getPixel(x: number, y: number) {
            const index = (y * pixels.width + x) * 4;
            return rgbaToGrayscale(pixels.data[index] / 255, pixels.data[index + 1] / 255, pixels.data[index + 2] / 255, pixels.data[index + 3] / 255);
          }
        }));
      }
      else {
        const mime = outputFormat.mime;
        const quality = mime === "image/jpeg" ? 0.92 : undefined;
        bytes = await new Promise((resolve, reject) => {
          this.#canvas!.toBlob((blob) => {
            if (!blob) return reject("Canvas output failed");
            blob.arrayBuffer().then(buf => resolve(new Uint8Array(buf)));
          }, mime, quality);
        });
      }

      const name = inputFile.name.split(".")[0] + "." + outputFormat.extension;

      outputFiles.push({ bytes, name });

    }

    return outputFiles;

  }

}

export default canvasToBlobHandler;
