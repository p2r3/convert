import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import Formats from "src/Formats.ts";
import JSZip from "jszip";
import { InitializationError } from "src/errors.ts";
import type { ConvertContext } from "src/ui/ProgressStore.ts";
import { changeExt, decode } from "src/common/index.ts";
import { canvasToBlob, createCanvas, type CanvasBundle } from "src/common/canvas.ts";

class piskelHandler implements FormatHandler {
  public readonly name = "piskel";
  public supportedFormats = [
    Formats.PNG.builder("png").lossless().to(),
    Formats.ZIP.builder("zip").lossless().options({ compression: true }).to(),
    Formats.PISKEL.builder("piskel").lossless().from(),
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
    convertCtx?: ConvertContext,
  ): Promise<FileData[]> {
    if (!this.ready || !this.#bundle) {
      throw new InitializationError("Handler not initialized.");
    }
    const { canvas, ctx } = this.#bundle;

    if (!(inputFormat.internal === "piskel" && ["png", "zip"].includes(outputFormat.internal))) {
      throw new TypeError(
        `Unsupported conversion path: ${inputFormat.internal} -> ${outputFormat.internal}`,
      );
    }

    const outputFiles: FileData[] = [];

    for (const inputFile of inputFiles) {
      const fileRaw = decode(inputFile.bytes);
      const contents = JSON.parse(fileRaw);

      const version: number = contents.modelVersion;
      if (version !== 2) {
        throw new Error(`Only version 2 piskel files are supported. Found version of ${version}.`);
      }

      const layers: string[] = contents.piskel.layers;
      if (layers.length === 0) {
        throw new RangeError("No layers to convert.");
      }

      const spriteWidth: number = contents.piskel.width;
      const spriteHeight: number = contents.piskel.height;

      // We're parsing the first layer, because they decided to
      // duplicate the frame count for each layer instead of
      // keeping it global, despite the fact that each layer
      // has the same frame count.
      const temp = JSON.parse(layers[0]);
      const frameCount: number = temp.frameCount;

      canvas.width = spriteWidth * frameCount;
      canvas.height = spriteHeight;

      // We're clearing here because each layer needs to
      // superimpose itself onto the previous.
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const layerRaw of layers) {
        const layer = JSON.parse(layerRaw);

        const opacity: number = layer.opacity;

        // I'm not entirely sure, but I think only the first chunk is used?
        const layerB64: string = layer.chunks[0].base64PNG;

        const blob = await (await fetch(layerB64)).blob(); // funny decoding
        const image = await createImageBitmap(blob);

        ctx.globalAlpha = opacity;
        ctx.drawImage(image, 0, 0);
      }

      if (outputFormat.internal === "png") {
        const bytes = await canvasToBlob(this.#bundle, outputFormat.mime);

        const name = changeExt(inputFile.name, outputFormat.extension);
        outputFiles.push({ bytes, name });
      } else if (outputFormat.internal === "zip") {
        const zip = new JSZip();

        // Slice the sprite sheet into frames directly from the main canvas
        const frame = createCanvas(spriteWidth, spriteHeight);
        for (let i = 0; i < frameCount; i++) {
          frame.ctx.clearRect(0, 0, spriteWidth, spriteHeight);
          frame.ctx.drawImage(canvas, -i * spriteWidth, 0);

          const bytes = await canvasToBlob(frame, "image/png");
          const name = changeExt(inputFile.name, "png", `_Frame${i}`);
          zip.file(name, bytes);
        }

        const level = convertCtx?.options.compression;
        const bytes = await zip.generateAsync({
          type: "uint8array",
          compression: level ? "DEFLATE" : "STORE",
          compressionOptions: level ? { level } : undefined,
        });
        const name = changeExt(inputFile.name, outputFormat.extension);
        outputFiles.push({ bytes, name });
      }
    }

    return outputFiles;
  }
}

export default piskelHandler;
