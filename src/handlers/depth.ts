import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import { FormatDefinition } from "../FormatHandler.ts";
import Formats, { Category } from "src/Formats.ts";
import type { ConvertContext } from "src/ui/ProgressStore.ts";
import { canvasToBlob, createCanvas } from "src/common/canvas.ts";
import { changeExt } from "src/common/index.ts";
import * as ort from "onnxruntime-web/wasm";
import wasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";
// Depth Anything V2 Small with int8 weights: 27 MB instead of 99 MB, and the same picture
import modelUrl from "built/depth-anything-v2-small/model_int8.onnx?url";

// its own format, so that picking it is a request for the depth map rather than a plain PNG
const DEPTH_MAP = new FormatDefinition(
  "Depth map (near is light)",
  "depth",
  "png",
  "image/png",
  Category.IMAGE,
);

/** The model's patches are 14 pixels a side, so it takes sides that are multiples of 14. */
const PATCH = 14;
/** Shorter side the model was trained at. */
const SIZE = 518;
// ImageNet statistics, which the model was trained with
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

/** The size the model sees a picture at: shorter side 518, longer side at most twice that. */
export function modelSize(width: number, height: number): [number, number] {
  const scale = Math.min(SIZE / Math.min(width, height), (2 * SIZE) / Math.max(width, height));
  const side = (n: number) => Math.max(PATCH, Math.round((n * scale) / PATCH) * PATCH);
  return [side(width), side(height)];
}

class depthHandler implements FormatHandler {
  public readonly name = "depth";
  public supportedFormats = [
    Formats.PNG.builder("png").from(),
    Formats.JPEG.builder("jpeg").from(),
    DEPTH_MAP.builder("png").lossless().to(),
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
      ctx?.progress("Loading the depth model...", 0);
      // served by this site instead of the CDN the runtime would otherwise look at
      ort.env.wasm.wasmPaths = { wasm: wasmUrl };
      this.#session = ort.InferenceSession.create(modelUrl, { executionProviders: ["wasm"] });
      this.#session.catch(() => (this.#session = undefined));
    }
    const session = await this.#session;
    const outputFiles: FileData[] = [];

    for (const [i, file] of inputFiles.entries()) {
      ctx?.throwIfAborted();
      ctx?.progress(`Measuring depth in ${file.name}...`, i / inputFiles.length);

      const image = await createImageBitmap(new Blob([file.bytes as BlobPart]));
      const [w, h] = modelSize(image.width, image.height);
      const small = createCanvas(w, h);
      small.ctx.imageSmoothingQuality = "high";
      small.ctx.drawImage(image, 0, 0, w, h);
      const pixels = small.ctx.getImageData(0, 0, w, h);

      // planar RGB from 0 to 1, normalised
      const input = new Float32Array(3 * w * h);
      for (let p = 0; p < w * h; p++) {
        for (let c = 0; c < 3; c++) {
          input[c * w * h + p] = (pixels.data[p * 4 + c] / 255 - MEAN[c]) / STD[c];
        }
      }
      const result = await session.run({
        [session.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, h, w]),
      });
      // relative inverse depth: larger is nearer, on no particular scale
      const depth = result[session.outputNames[0]].data as Float32Array;

      let min = Infinity;
      let max = -Infinity;
      for (const value of depth) {
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
      const range = max - min || 1;
      for (let p = 0; p < w * h; p++) {
        const grey = ((depth[p] - min) / range) * 255;
        pixels.data[p * 4] = pixels.data[p * 4 + 1] = pixels.data[p * 4 + 2] = grey;
        pixels.data[p * 4 + 3] = 255;
      }
      small.ctx.putImageData(pixels, 0, 0);

      const full = createCanvas(image.width, image.height);
      full.ctx.imageSmoothingQuality = "high";
      full.ctx.drawImage(small.canvas, 0, 0, image.width, image.height);
      image.close();

      outputFiles.push({
        name: changeExt(file.name, "png", "-depth"),
        bytes: await canvasToBlob(full, "image/png"),
      });
    }

    return outputFiles;
  }
}

export default depthHandler;
