import { imageTracer } from 'imagetracer'

import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

class svgTraceHandler implements FormatHandler {

  public name: string = "svgTrace";
  public supportedFormats?: FileFormat[];
  public ready: boolean = false;

  async init() {
    this.supportedFormats = [
      {
        name: "Portable Network Graphics",
        format: "png",
        extension: "png",
        mime: "image/png",
        from: true,
        to: false,
        internal: "png",
        category: "image"
      },
      {
        name: "Joint Photographic Experts Group JFIF",
        format: "jpeg",
        extension: "jpg",
        mime: "image/jpeg",
        from: true,
        to: false,
        internal: "jpeg",
        category: "image",
      },
      {
        name: "WebP",
        format: "webp",
        extension: "webp",
        mime: "image/webp",
        from: true,
        to: false,
        internal: "webp", // note there is both animated svgs, and animted webPs, although this converter does not support either
        category: "image"
      },
      {
        name: "Scalable Vector Graphics",
        format: "svg",
        extension: "svg",
        mime: "image/svg+xml",
        from: false,
        to: true,
        internal: "svg",
        category: ["image", "vector", "document"],
        lossless: false
      },
    ];
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {
    if (outputFormat.internal !== "svg") throw "Invalid output format.";

    const outputFiles: FileData[] = [];
    const encoder = new TextEncoder();

    for (const inputFile of inputFiles) {
      const blob = new Blob([inputFile.bytes as BlobPart], { type: inputFormat.mime });
      const url = URL.createObjectURL(blob)
      const traced = await imageTracer.imageToSVG(url) // return the full svg string
      const name = inputFile.name.split(".")[0] + ".svg"
      const bytes = encoder.encode(traced);


      outputFiles.push({ bytes, name });
    }
    return outputFiles;
  }

}

export default svgTraceHandler;
