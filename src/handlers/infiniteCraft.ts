import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import Formats from "src/Formats.ts";
import { changeExt, decode, encode } from "src/common/index.ts";
import { compressGzip } from "src/common/gzip.ts";

class infiniteCraftHandler implements FormatHandler {
  public readonly name = "infiniteCraft";
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

    const compressedBytes = await compressGzip(outputBytes);

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

export default infiniteCraftHandler;
