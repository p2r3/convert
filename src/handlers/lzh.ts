import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import { LZHDecoder } from "./lzh/decoder.ts";
import { LZHEncoder, type LHAFileInput } from "./lzh/encoder.ts";
import Formats, { SpecialFormats } from "src/Formats.ts";
import { InitializationError } from "src/errors.ts";

/**
 * LZH/LHA Archive Handler
 * Handles LZH (Lempel-Ziv-Huffman) and LHA archive formats
 *
 * Supports:
 * - Extracting LZH/LHA archives to individual files (SpecialFormats.ANY)
 * - Packing any input(s) into a single LZH archive
 * - Multiple compression methods (lh0, lh1, lh4, lh5, lh6, lh7)
 */
export default class lzhHandler implements FormatHandler {
  public readonly name = "lzh";
  public supportedFormats = [
    Formats.LZH.builder("lzh").lossless().fromTo(),
    SpecialFormats.ANY.builder("ANY").lossless().fromTo(),
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
    if (!this.ready) {
      throw new InitializationError("Handler not initialized.");
    }

    if (inputFormat.internal === "lzh" && outputFormat.mime === SpecialFormats.ANY.mime) {
      const outputFiles: FileData[] = [];
      for (const inputFile of inputFiles) {
        const decoder = new LZHDecoder(inputFile.bytes);
        for (const file of decoder.extractAll()) {
          // Skip directory entries
          if (file.method === "-lhd-" || file.filename.endsWith("/")) continue;
          // Flatten paths, keeping only the file name
          const filename = file.filename.replace(/\\/g, "/").split("/").pop() || file.filename;
          outputFiles.push({ name: filename, bytes: file.data });
        }
      }
      return outputFiles;
    }

    if (outputFormat.internal === "lzh") {
      const filesToArchive: LHAFileInput[] = inputFiles.map((inputFile) => ({
        filename: inputFile.name,
        data: inputFile.bytes,
        timestamp: new Date(),
      }));
      const lzhData = new LZHEncoder().create(filesToArchive);
      return [{ name: "archive." + outputFormat.extension, bytes: lzhData }];
    }

    throw new TypeError(`Unsupported conversion: ${inputFormat.format} to ${outputFormat.format}`);
  }
}
