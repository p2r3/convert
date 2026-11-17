import { imageTracer } from "imagetracer";

import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import Formats from "src/Formats.ts";
import { changeExt, encode } from "src/common/index.ts";
import { blobToCanvas, createCanvas } from "src/common/canvas.ts";
import type { ConvertContext } from "src/ui/ProgressStore.ts";

type Preset = keyof typeof imageTracer.optionpresets;

class svgTraceHandler implements FormatHandler {
  public readonly name = "svgTrace";
  public supportedFormats = [
    Formats.PNG.builder("png").from(),
    Formats.JPEG.builder("jpeg").from(),
    // note there is both animated svgs, and animted webPs, although this converter does not support either
    Formats.WEBP.builder("webp").from(),
    Formats.SVG.builder("svg")
      .options({
        preset: { type: "enum", label: "Preset", values: Object.keys(imageTracer.optionpresets) },
        colors: { type: "number", label: "Colors", min: 2, max: 256, integer: true },
      })
      .to(),
  ];
  public ready = false;

  async init() {
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
    convertCtx?: ConvertContext,
  ): Promise<FileData[]> {
    if (outputFormat.internal !== "svg")
      throw new TypeError(`Unsupported output format: ${outputFormat.internal}`);

    const outputFiles: FileData[] = [];
    const { preset, colors } = convertCtx?.options ?? {};
    const options = {
      ...imageTracer.optionpresets[(preset as Preset | undefined) ?? "default"],
      ...(colors === undefined ? {} : { numberofcolors: colors as number }),
    };

    for (const inputFile of inputFiles) {
      const bundle = createCanvas();
      await blobToCanvas(bundle, inputFile.bytes, inputFormat.mime);
      const { canvas, ctx } = bundle;
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const traced = imageTracer.imageDataToSVG(imageData, options); // return the full svg string
      const name = changeExt(inputFile.name, "svg");
      const bytes = encode(traced);

      outputFiles.push({ bytes, name });
    }
    return outputFiles;
  }
}

export default svgTraceHandler;
