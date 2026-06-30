import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats, { Category } from "src/CommonFormats.ts";

class alsHandler implements FormatHandler {

  public name: string = "als";

  public supportedFormats: FileFormat[] = [
    {
      name: "Ableton Live Set",
      format: "als",
      extension: "als",
      mime: "application/gzip",
      from: true,
      to: false,
      internal: "als",
      category: Category.DATA,
      lossless: true
    },
    CommonFormats.XML.builder("xml").allowTo(),
  ];

  public ready: boolean = false;

  async init () {
    this.ready = true;
  }

  async doConvert (
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {
    if (inputFormat.internal !== "als" || outputFormat.internal !== "xml") {
      throw new TypeError(`Unsupported conversion path: ${inputFormat.internal} -> ${outputFormat.internal}`);
    }

    const decoder = new TextDecoder("utf-8", { fatal: true });
    const encoder = new TextEncoder();

    return Promise.all(inputFiles.map(async (inputFile) => {
      if (
        inputFile.bytes.length < 2
        || inputFile.bytes[0] !== 0x1f
        || inputFile.bytes[1] !== 0x8b
      ) {
        throw new Error("Invalid ALS file: expected gzip-compressed data.");
      }

      const decompressedStream = new Blob([inputFile.bytes as BlobPart])
      .stream()
      .pipeThrough(new DecompressionStream("gzip"));
      const decompressedBytes = new Uint8Array(await new Response(decompressedStream).arrayBuffer());

      let xml: string;
      try {
        xml = decoder.decode(decompressedBytes);
      } catch (_) {
        throw new Error("Invalid ALS file: decompressed data is not UTF-8 XML.");
      }
      if (!xml.trimStart().startsWith("<")) {
        throw new Error("Invalid ALS file: decompressed data is not XML.");
      }

      const baseNameParts = inputFile.name.split(".");
      const baseName = baseNameParts.length > 1
        ? baseNameParts.slice(0, -1).join(".")
        : inputFile.name;

      return {
        name: `${baseName}.xml`,
        bytes: encoder.encode(xml)
      };
    }));
  }

}

export default alsHandler;
