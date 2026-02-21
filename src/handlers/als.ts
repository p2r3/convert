import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

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
      internal: "als"
    },
    {
      name: "XML Document",
      format: "xml",
      extension: "xml",
      mime: "application/xml",
      from: false,
      to: true,
      internal: "xml"
    }
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
      throw "Invalid conversion path.";
    }

    const decoder = new TextDecoder("utf-8", { fatal: true });
    const encoder = new TextEncoder();

    return Promise.all(inputFiles.map(async (inputFile) => {
      if (
        inputFile.bytes.length < 2
        || inputFile.bytes[0] !== 0x1f
        || inputFile.bytes[1] !== 0x8b
      ) {
        throw "Invalid ALS file: expected gzip-compressed data.";
      }

      const decompressedStream = new Blob([inputFile.bytes as BlobPart])
      .stream()
      .pipeThrough(new DecompressionStream("gzip"));
      const decompressedBytes = new Uint8Array(await new Response(decompressedStream).arrayBuffer());

      let xml: string;
      try {
        xml = decoder.decode(decompressedBytes);
      } catch (_) {
        throw "Invalid ALS file: decompressed data is not UTF-8 XML.";
      }
      if (!xml.trimStart().startsWith("<")) {
        throw "Invalid ALS file: decompressed data is not XML.";
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
