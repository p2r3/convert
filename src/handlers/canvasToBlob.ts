import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

class canvasToBlobHandler implements FormatHandler {

  public name: string = "canvasToBlob";

  public supportedFormats: FileFormat[] = [
    {
      name: "Portable Network Graphics",
      format: "png",
      extension: "png",
      mime: "image/png",
      from: true,
      to: true,
      internal: "png"
    },
    {
      name: "Joint Photographic Experts Group JFIF",
      format: "jpeg",
      extension: "jpg",
      mime: "image/jpeg",
      from: true,
      to: true,
      internal: "jpeg"
    },
    {
      name: "WebP",
      format: "webp",
      extension: "webp",
      mime: "image/webp",
      from: true,
      to: true,
      internal: "webp"
    },
    {
      name: "CompuServe Graphics Interchange Format (GIF)",
      format: "gif",
      extension: "gif",
      mime: "image/gif",
      from: true,
      to: false,
      internal: "gif"
    },
    {
      name: "Scalable Vector Graphics",
      format: "svg",
      extension: "svg",
      mime: "image/svg+xml",
      from: true,
      to: false,
      internal: "svg"
    },
    {
      name: "Plain Text",
      format: "text",
      extension: "txt",
      mime: "text/plain",
      from: true,
      to: false,
      internal: "text"
    }
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

      const bytes: Uint8Array = await new Promise((resolve, reject) => {
        this.#canvas!.toBlob((blob) => {
          if (!blob) return reject("Canvas output failed");
          blob.arrayBuffer().then(buf => resolve(new Uint8Array(buf)));
        }, outputFormat.mime);
      });
      const name = inputFile.name.split(".")[0] + "." + outputFormat.extension;

      outputFiles.push({ bytes, name });

    }

    return outputFiles;

  }

}

export default canvasToBlobHandler;
