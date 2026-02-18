import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import { LZHDecoder } from "./lzh/decoder.ts";
import { LZHEncoder, type LHAFileInput } from "./lzh/encoder.ts";
import JSZip from "jszip";
import normalizeMimeType from "../normalizeMimeType.ts";
import mime from "mime";

/**
 * LZH/LHA Archive Handler
 * Handles LZH (Lempel-Ziv-Huffman) and LHA archive formats
 * 
 * Supports:
 * - Extracting LZH/LHA archives to individual files
 * - Converting LZH/LHA archives to ZIP format
 * - Multiple compression methods (lh0, lh1, lh4, lh5, lh6, lh7)
 */
class LZHHandler implements FormatHandler {
  public name: string = "lzh";
  
  public supportedFormats: FileFormat[] = [
    {
      name: "LZH/LHA Archive",
      format: "lzh",
      extension: "lzh",
      mime: "application/x-lzh-compressed",
      from: true,
      to: true,
      internal: "lzh",
      category: "archive",
      lossless: true
    },
    {
      name: "ZIP Archive",
      format: "zip",
      extension: "zip",
      mime: "application/zip",
      from: true,
      to: true,
      internal: "zip",
      category: "archive",
      lossless: true
    },
    {
      name: "JavaScript Object Notation",
      format: "json",
      extension: "json",
      mime: "application/json",
      from: false,
      to: true,
      internal: "json",
      category: "data",
      lossless: false
    }
  ];

  public supportAnyInput: boolean = true;
  public ready: boolean = false;

  async init() {
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {
    
    if (!this.ready) {
      throw new Error("Handler not initialized");
    }

    const outputFiles: FileData[] = [];

    // Convert LZH/LHA to JSON (archive listing with data)
    if (inputFormat.internal === "lzh" && outputFormat.internal === "json") {
      for (const inputFile of inputFiles) {
        const decoder = new LZHDecoder(inputFile.bytes);
        const extractedFiles = decoder.extractAll();

        // Sanitize all string values to ensure valid JSON
        const sanitizeString = (str: string): string => {
          return str.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim() || 'unknown';
        };

        // Convert bytes to base64 string
        const bytesToBase64 = (bytes: Uint8Array): string => {
          let binary = '';
          for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          return btoa(binary);
        };

        const archiveInfo = {
          archiveName: sanitizeString(inputFile.name),
          fileCount: extractedFiles.length,
          totalOriginalSize: extractedFiles.reduce((sum, f) => sum + f.originalSize, 0),
          totalCompressedSize: extractedFiles.reduce((sum, f) => sum + f.compressedSize, 0),
          files: extractedFiles.map(file => ({
            filename: sanitizeString(file.filename),
            originalSize: file.originalSize,
            compressedSize: file.compressedSize,
            timestamp: file.timestamp.toISOString(),
            compressionMethod: sanitizeString(file.method),
            crc: `0x${file.crc.toString(16).toUpperCase().padStart(4, '0')}`,
            compressionRatio: file.compressedSize > 0 && file.originalSize > 0
              ? ((1 - file.compressedSize / file.originalSize) * 100).toFixed(2) + '%'
              : '0%',
            isDirectory: file.method === "-lhd-" || file.filename.endsWith("/"),
            data: bytesToBase64(file.data)
          }))
        };

        const jsonStr = JSON.stringify(archiveInfo, null, 2);
        const encoder = new TextEncoder();
        const baseName = inputFile.name.replace(/\.(lzh|lha)$/i, "");

        outputFiles.push({
          name: baseName + ".json",
          bytes: encoder.encode(jsonStr)
        });
      }
    } else if (inputFormat.internal === "lzh" && outputFormat.internal === "zip") {
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
            date: file.timestamp
          });
        }

        const zipData = await zip.generateAsync({ 
          type: "uint8array",
          compression: "DEFLATE",
          compressionOptions: { level: 9 }
        });

        const baseName = inputFile.name.replace(/\.(lzh|lha)$/i, "");
        outputFiles.push({
          name: baseName + ".zip",
          bytes: zipData
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
            bytes: file.data
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
              timestamp: zipEntry.date || new Date()
            });
          }
        }

        // Create LZH archive
        const encoder = new LZHEncoder();
        const lzhData = encoder.create(filesToArchive);

        const baseName = inputFile.name.replace(/\.zip$/i, "");
        outputFiles.push({
          name: baseName + "." + outputFormat.extension,
          bytes: lzhData
        });
      }
    } else if (outputFormat.internal === "lzh") {
      // Convert multiple files to LZH/LHA archive
      const filesToArchive: LHAFileInput[] = [];

      for (const inputFile of inputFiles) {
        filesToArchive.push({
          filename: inputFile.name,
          data: inputFile.bytes,
          timestamp: new Date()
        });
      }

      const encoder = new LZHEncoder();
      const lzhData = encoder.create(filesToArchive);

      outputFiles.push({
        name: "archive." + outputFormat.extension,
        bytes: lzhData
      });
    } else {
      throw new Error(`Unsupported conversion: ${inputFormat.format} to ${outputFormat.format}`);
    }

    return outputFiles;
  }
}

export default LZHHandler;
