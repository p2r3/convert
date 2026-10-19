import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import { FormatDefinition } from "../FormatHandler.ts";
import Formats, { Category } from "src/Formats.ts";
import type { ConvertContext } from "src/ui/ProgressStore.ts";
import { canvasToBlob, createCanvas } from "src/common/canvas.ts";
import { changeExt } from "src/common/index.ts";
import WebSR from "@websr/websr";
// two sets of weights for the same networks: "rl" was trained on filmed footage, "an" on animation
import photoLargeUrl from "@websr/websr/weights/anime4k/cnn-2x-l-rl.json?url";
import drawingLargeUrl from "@websr/websr/weights/anime4k/cnn-2x-l-an.json?url";
import photoMediumUrl from "@websr/websr/weights/anime4k/cnn-2x-m-rl.json?url";
import drawingMediumUrl from "@websr/websr/weights/anime4k/cnn-2x-m-an.json?url";

// Their own formats, so that picking one is a request to upscale rather than a plain PNG or MP4.
// The kind of picture comes first in the name: the format list cuts long names short, and the
// extension next to it already says PNG or MP4.
const image = (kind: string, format: string) =>
  new FormatDefinition(`${kind}, upscaled 2×`, format, "png", "image/png", Category.IMAGE);
const video = (kind: string, format: string) =>
  new FormatDefinition(`${kind}, upscaled 2×`, format, "mp4", "video/mp4", Category.VIDEO);

// by the internal name of the output format: a URL there would end up in the format cache
const WEIGHTS: Record<string, string> = {
  "photo-large": photoLargeUrl,
  "drawing-large": drawingLargeUrl,
  "photo-medium": photoMediumUrl,
  "drawing-medium": drawingMediumUrl,
};

/**
 * Sets up a network that draws every source it is given, at twice the size, on `canvas`.
 * @param weights A key of {@link WEIGHTS}. Its ending names the network the weights are for.
 */
async function createUpscaler(weights: string) {
  const gpu = await WebSR.initWebGPU();
  if (!gpu) {
    throw new Error("Upscaling needs WebGPU, which this browser or device does not offer.");
  }
  const canvas = new OffscreenCanvas(1, 1);
  const upscaler = new WebSR({
    network_name: weights.endsWith("large") ? "anime4k/cnn-2x-l" : "anime4k/cnn-2x-m",
    weights: await (await fetch(WEIGHTS[weights])).json(),
    gpu,
    canvas: canvas as unknown as HTMLCanvasElement,
  });

  /** Refuses a source whose result the graphics card cannot hold in one texture. */
  const check = (width: number, height: number) => {
    const limit = gpu.limits.maxTextureDimension2D / 2;
    if (Math.max(width, height) > limit) {
      throw new Error(
        `${width} × ${height} is too large to upscale here: the limit is ${limit} pixels a side.`,
      );
    }
  };
  return { canvas, upscaler, check };
}

/** Doubles the size of an image with the Anime4K networks of WebSR. */
class upscaleHandler implements FormatHandler {
  public readonly name = "upscale";
  public supportedFormats = [
    Formats.PNG.builder("png").from(),
    // the large network: one image is worth the wait that every frame of a video is not
    image("Photo", "upscaled-photo").builder("photo-large").lossless().to(),
    image("Drawing", "upscaled-drawing").builder("drawing-large").lossless().to(),
  ];
  public ready = false;

  async init() {
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    _inputFormat: FileFormat,
    outputFormat: FileFormat,
    _args?: string[],
    ctx?: ConvertContext,
  ): Promise<FileData[]> {
    const { canvas, upscaler, check } = await createUpscaler(outputFormat.internal);
    const full = createCanvas();
    const outputFiles: FileData[] = [];

    for (const [i, file] of inputFiles.entries()) {
      ctx?.throwIfAborted();
      ctx?.progress(`Upscaling ${file.name}...`, i / inputFiles.length);

      const source = await createImageBitmap(new Blob([file.bytes as BlobPart]));
      check(source.width, source.height);
      await upscaler.render(source);

      full.canvas.width = canvas.width;
      full.canvas.height = canvas.height;
      full.ctx.globalCompositeOperation = "source-over";
      full.ctx.drawImage(canvas, 0, 0);
      // the network knows no transparency, so that comes from the original, stretched to fit
      full.ctx.globalCompositeOperation = "destination-in";
      full.ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
      source.close();

      outputFiles.push({
        name: changeExt(file.name, "png", "-2x"),
        bytes: await canvasToBlob(full, "image/png"),
      });
    }

    await upscaler.destroy();
    return outputFiles;
  }
}

/** Doubles the size of a video, frame by frame, and keeps its sound. */
export class upscaleVideoHandler implements FormatHandler {
  public readonly name = "upscaleVideo";
  public supportedFormats = [
    Formats.MP4.builder("mp4").from(),
    video("Film", "upscaled-film").builder("photo-medium").to(),
    video("Animation", "upscaled-animation").builder("drawing-medium").to(),
  ];
  public ready = false;

  async init() {
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    _inputFormat: FileFormat,
    outputFormat: FileFormat,
    _args?: string[],
    ctx?: ConvertContext,
  ): Promise<FileData[]> {
    const mb = await import("mediabunny");
    const { canvas, upscaler, check } = await createUpscaler(outputFormat.internal);
    const outputFiles: FileData[] = [];

    for (const [i, file] of inputFiles.entries()) {
      ctx?.throwIfAborted();
      const input = new mb.Input({
        formats: mb.ALL_FORMATS,
        source: new mb.BufferSource(file.bytes),
      });
      const output = new mb.Output({
        format: new mb.Mp4OutputFormat(),
        target: new mb.BufferTarget(),
      });
      const conversion = await mb.Conversion.init({
        input,
        output,
        video: (track) => {
          check(track.displayWidth, track.displayHeight);
          return {
            processedWidth: track.displayWidth * 2,
            processedHeight: track.displayHeight * 2,
            // new detail is the point, and a low bitrate would blur it away again
            quality: mb.QUALITY_HIGH,
            async process(sample) {
              const frame = sample.toVideoFrame();
              try {
                await upscaler.render(frame);
              } finally {
                frame.close();
              }
              return canvas;
            },
          };
        },
      });
      conversion.onProgress = (progress, seconds) => {
        ctx?.progress(
          `Upscaling ${file.name}... (${seconds.toFixed(1)}s done)`,
          (i + progress) / inputFiles.length,
        );
      };
      await conversion.execute({ pauseSignal: ctx?.signal });
      ctx?.throwIfAborted();
      if (!output.target.buffer) throw new Error(`${file.name} could not be upscaled.`);

      outputFiles.push({
        name: changeExt(file.name, "mp4", "-2x"),
        bytes: new Uint8Array(output.target.buffer),
      });
    }

    await upscaler.destroy();
    return outputFiles;
  }
}

export default upscaleHandler;
