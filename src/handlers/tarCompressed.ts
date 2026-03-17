// file: tarCompressed.ts

import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats from "src/CommonFormats.ts";
import { gzipSync as gzip, gunzipSync as gunzip } from "fflate";
import { compress as zstd, decompress as unzstd, init as zstd_init } from "@bokuweb/zstd-wasm";
import { compress as xz, decompress as unxz, init as xz_init } from "./tarCompressed/xz.ts";

function tarCompressedHandler(
  name: string, 
  format: FileFormat, 
  init: () => Promise<void>,
  compress: (inputFile: FileData, outputFiles: FileData[]) => Promise<void>,
  decompress: (inputFile: FileData, outputFiles: FileData[]) => Promise<void>,
): FormatHandler {
  return {
    name: name,
    ready: false,
    supportedFormats: [
      CommonFormats.TAR.builder("tar").allowFrom().allowTo().markLossless(),
      format
    ],

    async init() {
      await init();
      this.ready = true;
    },

    async doConvert (
      inputFiles: FileData[],
      inputFormat: FileFormat,
      outputFormat: FileFormat
    ): Promise<FileData[]> {
      const outputFiles: FileData[] = [];

      for (const inputFile of inputFiles) { 
        if (inputFormat.internal === "tar") {
          await compress(inputFile, outputFiles);
        } else if (outputFormat.internal === "tar") {
          await decompress(inputFile, outputFiles);
        } else {
          throw new Error(`${name} cannot process this conversion`);
        }
      }

      return outputFiles;
    }
  };
}

export const tarGzHandler = tarCompressedHandler(
  "tarGz",
  {
    name: "Gzipped Tape Archive",
    format: "tar.gz",
    extension: "gz",
    mime: "application/gzip",
    from: true,
    to: true,
    internal: "tar.gz",
    category: "archive",
    lossless: true
  },
  async () => {},
  async (inputFile, outputFiles) => {
    const bytes = gzip(inputFile.bytes);
    outputFiles.push({ bytes, name: inputFile.name + ".gz" });
  },
  async (inputFile, outputFiles) => {
    const bytes = gunzip(inputFile.bytes);
    outputFiles.push({ bytes, name: inputFile.name.replace(/\.gz$/i, "") });
  },
);

export const tarZstdHandler = tarCompressedHandler(
  "tarZstd",
  {
    name: "Zstd compressed Tape Archive",
    format: "tar.zst",
    extension: "zst",
    mime: "application/zstd",
    from: true, 
    to: true,
    internal: "tar.zst",
    category: "archive",
    lossless: true
  },
  async () => {
    await zstd_init();
  },
  async (inputFile, outputFiles) => {
    const bytes = zstd(inputFile.bytes);
    outputFiles.push({ bytes, name: inputFile.name + ".zst" });
  },
  async (inputFile, outputFiles) => {
    const bytes = unzstd(inputFile.bytes);
    outputFiles.push({ bytes, name: inputFile.name.replace(/\.zst$/i, "") });
  },
);

export const tarXzHandler = tarCompressedHandler(
  "tarXz",
  {
    name: "XZ compressed Tape Archive",
    format: "tar.xz",
    extension: "xz",
    mime: "application/x-xz",
    from: true, 
    to: true,
    internal: "tar.xz",
    category: "archive",
    lossless: true
  },
  async () => {
    await xz_init();
  },
  async (inputFile, outputFiles) => {
    const bytes = xz(inputFile.bytes);
    outputFiles.push({ bytes, name: inputFile.name + ".xz" });
  },
  async (inputFile, outputFiles) => {
    const bytes = unxz(inputFile.bytes);
    outputFiles.push({ bytes, name: inputFile.name.replace(/\.xz$/i, "") });
  },
);