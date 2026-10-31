import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import Formats from "src/Formats.ts";
import { changeExt, decode, encode } from "src/common/index.ts";

class alsHandler implements FormatHandler {
  public readonly name = "als";
  public supportedFormats = [
    Formats.ALS.builder("als").lossless().from(),
    Formats.XML.builder("xml").to(),
  ];
  public ready = false;

  async init() {
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {
    if (inputFormat.internal !== "als" || outputFormat.internal !== "xml") {
      throw new TypeError(
        `Unsupported conversion path: ${inputFormat.internal} -> ${outputFormat.internal}`,
      );
    }

    return Promise.all(
      inputFiles.map(async (inputFile) => {
        if (
          inputFile.bytes.length < 2 ||
          inputFile.bytes[0] !== 0x1f ||
          inputFile.bytes[1] !== 0x8b
        ) {
          throw new Error("Invalid ALS file: expected gzip-compressed data.");
        }

        const decompressedStream = new Blob([inputFile.bytes as BlobPart])
          .stream()
          .pipeThrough(new DecompressionStream("gzip"));
        const decompressedBytes = await new Response(decompressedStream).bytes();

        let xml: string;
        try {
          xml = decode(decompressedBytes);
        } catch {
          throw new Error("Invalid ALS file: decompressed data is not UTF-8 XML.");
        }
        if (!xml.trimStart().startsWith("<")) {
          throw new Error("Invalid ALS file: decompressed data is not XML.");
        }

        return {
          name: changeExt(inputFile.name, "xml"),
          bytes: encode(xml),
        };
      }),
    );
  }
}

export default alsHandler;
