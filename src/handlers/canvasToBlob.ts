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

  async init () {
    this.#canvas = document.createElement("canvas");
    this.#ctx = this.#canvas.getContext("2d") || undefined;
    this.ready = true;
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
    for (const inputFile of inputFiles) {

      if (inputFormat.mime === "text/plain") {

        const font = "48px sans-serif";
        const fontSize = parseInt(font);
        const string = new TextDecoder().decode(inputFile.bytes);

        this.#ctx.font = font;
        this.#canvas.width = this.#ctx.measureText(string).width;
        this.#canvas.height = Math.floor(fontSize * 1.5);

        if (outputFormat.mime === "image/jpeg") {
          this.#ctx.fillStyle = "white";
          this.#ctx.fillRect(0, 0, this.#canvas.width, this.#canvas.height);
        }
        this.#ctx.fillStyle = "black";
        this.#ctx.strokeStyle = "white";
        this.#ctx.font = font;
        this.#ctx.fillText(string, 0, fontSize);
        this.#ctx.strokeText(string, 0, fontSize);

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
      if(outputFormat.mime == "text/plain") {
        const pixels = this.#ctx.getImageData(0, 0, this.#canvas.width, this.#canvas.height);
        bytes = new TextEncoder().encode(imageToText({
          width() { return pixels.width; },
          height() { return pixels.height; },
          getPixel(x: number, y: number) {
            const index = (y*pixels.width + x)*4;
            return rgbaToGrayscale(pixels.data[index]/255, pixels.data[index+1]/255, pixels.data[index+2]/255, pixels.data[index+3]/255);
          }
        }));
      }
      else {
        bytes = await new Promise((resolve, reject) => {
          this.#canvas!.toBlob((blob) => {
            if (!blob) return reject("Canvas output failed");
            blob.arrayBuffer().then(buf => resolve(new Uint8Array(buf)));
          }, outputFormat.mime);
        });
      }

      const name = inputFile.name.split(".")[0] + "." + outputFormat.extension;

      outputFiles.push({ bytes, name });

    }

    return outputFiles;

  }

}

export default canvasToBlobHandler;
