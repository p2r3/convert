import { imageTracer } from "imagetracer";

import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats from "src/CommonFormats.ts";

class svgTraceHandler implements FormatHandler {
  public name: string = "svgTrace";
  public supportedFormats?: FileFormat[];
  public ready: boolean = false;
  public offload: boolean = true;

  async init() {
    this.supportedFormats = [
      CommonFormats.PNG.builder("png").allowFrom(),
      CommonFormats.JPEG.builder("jpeg").allowFrom(),
      // note there is both animated svgs, and animted webPs, although this converter does not support either
      CommonFormats.WEBP.builder("webp").allowFrom(),
      CommonFormats.SVG.builder("svg").allowTo(),
    ];
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {
    if (outputFormat.internal !== "svg")
      throw new TypeError(`Unsupported output format: ${outputFormat.internal}`);

    const outputFiles: FileData[] = [];
    const encoder = new TextEncoder();

    for (const inputFile of inputFiles) {
      const blob = new Blob([inputFile.bytes as BlobPart], { type: inputFormat.mime });
      const image = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(image.width, image.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Failed to create 2D rendering context.");
      ctx.drawImage(image, 0, 0);
      image.close();
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const traced = imageTracer.imageDataToSVG(imageData); // return the full svg string
      const name = inputFile.name.split(".").slice(0, -1).join(".") + ".svg";
      const bytes = encoder.encode(traced);

      outputFiles.push({ bytes, name });
    }
    return outputFiles;
  }
}

export default svgTraceHandler;
