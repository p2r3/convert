import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import { FormatDefinition } from "../FormatHandler.ts";
import Formats, { Category } from "src/Formats.ts";
import type { ConvertContext } from "src/ui/ProgressStore.ts";
import { canvasToBlob, createCanvas } from "src/common/canvas.ts";
import { changeExt } from "src/common/index.ts";
import * as ort from "onnxruntime-web/wasm";
import wasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";
// silueta is U²-Net reduced from 176 MB to 44 MB. It takes the same input and gives the same
// output as the 4.6 MB u2netp that was here before, with cleaner edges.
import modelUrl from "built/silueta/silueta.onnx?url";

// its own format, so that picking it is a request to cut out the subject rather than a plain PNG
const NO_BACKGROUND = new FormatDefinition(
  "PNG with background removed",
  "nobg",
  "png",
  "image/png",
  Category.IMAGE,
);

/** Side length of the square the model takes and returns. */
const SIZE = 320;
// ImageNet statistics, which U²-Net was trained with
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

class removeBgHandler implements FormatHandler {
  public readonly name = "removeBg";
  public supportedFormats = [
    Formats.PNG.builder("png").from(),
    NO_BACKGROUND.builder("png").lossless().to(),
  ];
  public ready = false;

  #session?: Promise<ort.InferenceSession>;

  async init() {
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    _inputFormat: FileFormat,
    _outputFormat: FileFormat,
    _args?: string[],
    ctx?: ConvertContext,
  ): Promise<FileData[]> {
    if (!this.#session) {
      ctx?.progress("Loading the background removal model...", 0);
      // served by this site instead of the CDN the runtime would otherwise look at
      ort.env.wasm.wasmPaths = { wasm: wasmUrl };
      this.#session = ort.InferenceSession.create(modelUrl, { executionProviders: ["wasm"] });
      this.#session.catch(() => (this.#session = undefined));
    }
    const session = await this.#session;

    const small = createCanvas(SIZE, SIZE);
    const full = createCanvas();
    const outputFiles: FileData[] = [];

    for (const [i, file] of inputFiles.entries()) {
      ctx?.throwIfAborted();
      ctx?.progress(`Removing background from ${file.name}...`, i / inputFiles.length);

      const image = await createImageBitmap(new Blob([file.bytes as BlobPart]));
      small.ctx.clearRect(0, 0, SIZE, SIZE);
      small.ctx.drawImage(image, 0, 0, SIZE, SIZE);
      const pixels = small.ctx.getImageData(0, 0, SIZE, SIZE);

      // the model wants planar RGB, scaled by the brightest value and then normalised
      let brightest = 1;
      for (let p = 0; p < pixels.data.length; p += 4) {
        brightest = Math.max(brightest, pixels.data[p], pixels.data[p + 1], pixels.data[p + 2]);
      }
      const input = new Float32Array(3 * SIZE * SIZE);
      for (let p = 0; p < SIZE * SIZE; p++) {
        for (let c = 0; c < 3; c++) {
          input[c * SIZE * SIZE + p] = (pixels.data[p * 4 + c] / brightest - MEAN[c]) / STD[c];
        }
      }

      const result = await session.run({
        [session.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, SIZE, SIZE]),
      });
      // the first output is the fused, most accurate saliency map
      const saliency = result[session.outputNames[0]].data as Float32Array;

      let min = Infinity;
      let max = -Infinity;
      for (const value of saliency) {
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
      const range = max - min || 1;
      for (let p = 0; p < SIZE * SIZE; p++) {
        pixels.data[p * 4 + 3] = ((saliency[p] - min) / range) * 255;
      }
      small.ctx.putImageData(pixels, 0, 0);

      // "destination-in" keeps the image only where the stretched mask is opaque
      full.canvas.width = image.width;
      full.canvas.height = image.height;
      full.ctx.globalCompositeOperation = "source-over";
      full.ctx.drawImage(image, 0, 0);
      full.ctx.globalCompositeOperation = "destination-in";
      full.ctx.drawImage(small.canvas, 0, 0, image.width, image.height);
      image.close();

      outputFiles.push({
        name: changeExt(file.name, "png", "-nobg"),
        bytes: await canvasToBlob(full, "image/png"),
      });
    }

    return outputFiles;
  }
}

export default removeBgHandler;
