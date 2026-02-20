import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import { ZSTDDecoder } from "three/examples/jsm/libs/zstddec.module.js";

const decoder = new ZSTDDecoder();

class zstdHandler implements FormatHandler {
  public name = "zstd";

  public supportedFormats: FileFormat[] = [
    {
      name: "Zstandard Compressed Data",
      format: "zst",
      extension: "zst",
      mime: "application/zstd",
      from: true,
      to: false,
      internal: "zstd",
      category: "archive",
      lossless: true
    },
    {
      name: "Raw Binary Data",
      format: "bin",
      extension: "bin",
      mime: "application/octet-stream",
      from: false,
      to: true,
      internal: "raw",
      category: "data",
      lossless: true
    }
  ];

  public ready = false;

  async init() {
    await decoder.init();
    this.ready = true;
  }

  async doConvert(inputFiles: FileData[], inputFormat: FileFormat, outputFormat: FileFormat): Promise<FileData[]> {
    if (inputFormat.internal === "zstd" && outputFormat.internal === "raw") {
      return inputFiles.map((inputFile) => {
        const bytes = decoder.decode(inputFile.bytes);
        const name = inputFile.name.replace(/\.(zst|zstd)$/i, "") || `${inputFile.name}.bin`;
        return { name, bytes };
      });
    }

    throw "Invalid conversion path.";
  }
}

export default zstdHandler;
