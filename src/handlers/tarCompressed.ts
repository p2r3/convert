// file: tarCompressed.ts

import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats from "src/CommonFormats.ts";
import { gzipSync as gzip, gunzipSync as gunzip } from "fflate";
import { compress as zstd, decompress as unzstd, init as zstd_init } from "@bokuweb/zstd-wasm";

class tarGzHandler implements FormatHandler {

  public name: string = "tarGz";
  public supportedFormats?: FileFormat[] = [
    CommonFormats.TAR.builder("tar").allowFrom().allowTo().markLossless(),
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
    const outputFiles: FileData[] = [];

    for (const inputFile of inputFiles) { 
      if (inputFormat.internal === "tar") {
        const bytes = gzip(inputFile.bytes);
        outputFiles.push({ bytes, name: inputFile.name + ".gz" });
      } else if (outputFormat.internal === "tar") {
        const bytes = gunzip(inputFile.bytes);
        outputFiles.push({ bytes, name: inputFile.name.replace(/\.gz$/i, "") });
      } else {
        throw "tarGzHandler cannot process this conversion";
      }
    }

    return outputFiles;
  }

}

class tarZstdHandler implements FormatHandler {

  public name: string = "tarZstd";
  public supportedFormats?: FileFormat[] = [
    CommonFormats.TAR.builder("tar").allowFrom().allowTo().markLossless(),
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
  ];
  public ready: boolean = false;

  async init () {
    zstd_init();
    this.ready = true;
  }

  async doConvert (
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];

    for (const inputFile of inputFiles) { 
      if (inputFormat.internal === "tar") {
        const bytes = zstd(inputFile.bytes);
        outputFiles.push({ bytes, name: inputFile.name + ".zst" });
      } else if (outputFormat.internal === "tar") {
        const bytes = unzstd(inputFile.bytes);
        outputFiles.push({ bytes, name: inputFile.name.replace(/\.zst$/i, "") });
      } else {
        throw "tarZstdHandler cannot process this conversion";
      }
    }

    return outputFiles;
  }

}

export { tarGzHandler, tarZstdHandler };