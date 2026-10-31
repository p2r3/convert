import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import Formats from "src/Formats.ts";
import { changeExt, decode, encode } from "src/common/index.ts";

class txtToInfiniteCraftHandler implements FormatHandler {
  public readonly name = "txtToInfiniteCraft";
  public supportedFormats = [
    Formats.TEXT.builder("text").from(),
    Formats.INFINITE_CRAFT.builder("ic").to(),
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
    const inputFile = inputFiles[0];
    const text = decode(inputFile.bytes);
    const words = text.split(/[^a-zA-Z0-9']+/).filter(Boolean);

    const emojis = ["💧", "🔥", "🌬️", "🌍", "⚡", "❄️", "🌟", "🌈", "🌊", "🍃"];

    function getRandomEmoji(): string {
      return emojis[Math.floor(Math.random() * emojis.length)];
    }

    const jsonData = {
      name: "Save 1",
      version: "1.0",
      created: Date.now(),
      updated: 0,
      instances: [] as any[],
      items: words.map((word, index) => ({
        id: index,
        text: word,
        emoji: getRandomEmoji(),
      })),
    };

    const outputBytes = encode(JSON.stringify(jsonData, null, 2));

    const cs = new CompressionStream("gzip");

    const inputStream = new Response(outputBytes).body!;

    const compressedStream = inputStream.pipeThrough(cs);

    const compressedBytes = await new Response(compressedStream).bytes();

    const inputFileName = inputFile.name;

    const outputFileName = changeExt(inputFileName, "ic");

    const outputFiles: FileData[] = [
      {
        name: outputFileName,
        bytes: compressedBytes,
      },
    ];
    return outputFiles;
  }
}

class infiniteCraftToJsonHandler implements FormatHandler {
  public readonly name = "infiniteCraftToJson";
  public supportedFormats = [
    Formats.INFINITE_CRAFT.builder("ic").lossless().from(),
    Formats.JSON.builder("json").lossless().to(),
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
    // Credit to als.ts
    if (inputFormat.internal !== "ic" || outputFormat.internal !== "json") {
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
          throw new Error("Invalid IC file: expected gzip-compressed data.");
        }

        const decompressedStream = new Blob([inputFile.bytes as BlobPart])
          .stream()
          .pipeThrough(new DecompressionStream("gzip"));
        const decompressedBytes = await new Response(decompressedStream).bytes();

        let json: string;
        try {
          json = decode(decompressedBytes);
        } catch {
          throw new Error("Invalid IC file: decompressed data is not UTF-8 JSON.");
        }
        if (json.trimStart().startsWith("[")) {
          throw new Error("Invalid IC file: decompressed data should not be an array in JSON.");
        } else if (!json.trimStart().startsWith("{")) {
          throw new Error("Invalid IC file: decompressed data is not JSON.");
        }

        return {
          name: changeExt(inputFile.name, "json"),
          bytes: encode(json),
        };
      }),
    );
  }
}

export { txtToInfiniteCraftHandler, infiniteCraftToJsonHandler };
