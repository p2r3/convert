import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import { LZHDecoder } from "./lzh/decoder.ts";
import { LZHEncoder, type LHAFileInput } from "./lzh/encoder.ts";
import JSZip from "jszip";
import Formats from "src/Formats.ts";
import { InitializationError } from "src/errors.ts";
import { changeExt, encode } from "src/common/index.ts";

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
 * - Extracting LZH/LHA archives to individual files
 * - Converting LZH/LHA archives to ZIP format
 * - Multiple compression methods (lh0, lh1, lh4, lh5, lh6, lh7)
 */
export class lzhHandler implements FormatHandler {
  public readonly name = "lzh";
  public supportedFormats = [
    Formats.LZH.builder("lzh").lossless().fromTo(),
    Formats.ZIP.builder("zip").lossless().fromTo(),
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

    const outputFiles: FileData[] = [];

    if (inputFormat.internal === "lzh" && outputFormat.internal === "zip") {
      // Convert to ZIP
      for (const inputFile of inputFiles) {
        const decoder = new LZHDecoder(inputFile.bytes);
        const extractedFiles = decoder.extractAll();

        const zip = new JSZip();

        for (const file of extractedFiles) {
          // Skip directory entries
          if (file.method === "-lhd-" || file.filename.endsWith("/")) {
            continue;
          }

          zip.file(file.filename, file.data, {
            date: file.timestamp,
          });
        }

        const zipData = await zip.generateAsync({
          type: "uint8array",
          compression: "DEFLATE",
          compressionOptions: { level: 9 },
        });

        outputFiles.push({
          name: changeExt(inputFile.name, "zip"),
          bytes: zipData,
        });
      }
    } else if (inputFormat.internal === "lzh") {
      // Extract all files individually
      for (const inputFile of inputFiles) {
        const decoder = new LZHDecoder(inputFile.bytes);
        const extractedFiles = decoder.extractAll();

        for (const file of extractedFiles) {
          // Skip directory entries
          if (file.method === "-lhd-" || file.filename.endsWith("/")) {
            continue;
          }

          // Normalize the filename (remove path separators if needed)
          const filename = file.filename.replace(/\\/g, "/").split("/").pop() || file.filename;

          outputFiles.push({
            name: filename,
            bytes: file.data,
          });
        }
      }
    } else if (inputFormat.internal === "zip" && outputFormat.internal === "lzh") {
      // Convert ZIP to LZH/LHA
      for (const inputFile of inputFiles) {
        const zip = new JSZip();
        await zip.loadAsync(inputFile.bytes);

        const filesToArchive: LHAFileInput[] = [];

        // Extract all files from ZIP
        for (const [filename, zipEntry] of Object.entries(zip.files)) {
          if (!zipEntry.dir) {
            const data = await zipEntry.async("uint8array");
            filesToArchive.push({
              filename: filename,
              data: data,
              timestamp: zipEntry.date || new Date(),
            });
          }
        }

        // Create LZH archive
        const encoder = new LZHEncoder();
        const lzhData = encoder.create(filesToArchive);

        outputFiles.push({
          name: changeExt(inputFile.name, outputFormat.extension),
          bytes: lzhData,
        });
      }
    } else {
      throw new TypeError(
        `Unsupported conversion: ${inputFormat.format} to ${outputFormat.format}`,
      );
    }

    return outputFiles;
  }
}

// Packs any input(s) into a singular LZH file. Separated for tree purposes.
export class lzhAnyHandler implements FormatHandler {
  public readonly name = "lzhAny";
  public supportedFormats = [Formats.LZH.builder("lzh").lossless().to()];
  public supportAnyInput = true;
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
