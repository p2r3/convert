import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import { LZHDecoder } from "./lzh/decoder.ts";
import { LZHEncoder, type LHAFileInput } from "./lzh/encoder.ts";
import Formats, { SpecialFormats } from "src/Formats.ts";
import { InitializationError } from "src/errors.ts";

// Sanitize all string values to ensure valid JSON
function sanitizeString(str: string): string {
  // oxlint-disable-next-line eslint/no-control-regex
  return str.replace(/[\x00-\x1F\x7F-\x9F]/g, "").trim() || "unknown";
}

/**
 * LZH/LHA Archive Handler
 * Handles LZH (Lempel-Ziv-Huffman) and LHA archive formats
 *
 * Supports:
 * - Extracting LZH/LHA archives to individual files (SpecialFormats.ANY)
 * - Multiple compression methods (lh0, lh1, lh4, lh5, lh6, lh7)
 */
export class lzhHandler implements FormatHandler {
  public readonly name = "lzh";
  public supportedFormats = [
    Formats.LZH.builder("lzh").lossless().from(),
    SpecialFormats.ANY.builder("ANY").lossless().to(),
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
    if (inputFormat.internal !== "lzh" || outputFormat.mime !== SpecialFormats.ANY.mime) {
      throw new TypeError(
        `Unsupported conversion: ${inputFormat.format} to ${outputFormat.format}`,
      );
    }

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
}

// Packs any input(s) into a singular LZH file. Separated for tree purposes.
export class lzhAnyHandler implements FormatHandler {
  public readonly name = "lzhAny";
  public supportedFormats = [
    SpecialFormats.ANY.builder("ANY").from(),
    Formats.LZH.builder("lzh").lossless().to(),
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
      throw new Error("Handler not initialized");
    }

    const outputFiles: FileData[] = [];

    // Convert multiple files to LZH/LHA archive
    const filesToArchive: LHAFileInput[] = [];

    for (const inputFile of inputFiles) {
      filesToArchive.push({
        filename: inputFile.name,
        data: inputFile.bytes,
        timestamp: new Date(),
      });
    }

    const encoder = new LZHEncoder();
    const lzhData = encoder.create(filesToArchive);

    outputFiles.push({
      name: "archive." + outputFormat.extension,
      bytes: lzhData,
    });

    return outputFiles;
  }
}
