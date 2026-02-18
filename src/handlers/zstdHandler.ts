import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import { compress, decompress } from "fzstd";

class zstdHandler implements FormatHandler {

  public name: string = "zstd";

  public supportedFormats: FileFormat[] = [
    {
      name: "Zstandard Compressed File",
      format: "zst",
      extension: "zst",
      mime: "application/zstd",
      from: true,
      to: true,
      internal: "zst"
    }
  ];

  public supportAnyInput: boolean = true;

  public ready: boolean = false;

  async init() {
    // fzstd does not require async WASM loading in most builds,
    // but keeping this consistent with other handlers
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {

    const outputFiles: FileData[] = [];

    for (const file of inputFiles) {

      // 🔽 Decompress if input is .zst
      if (inputFormat.extension === "zst") {
        const decompressed = decompress(file.bytes);

        const newName = file.name.endsWith(".zst")
          ? file.name.slice(0, -4)
          : file.name + ".decompressed";

        outputFiles.push({
          bytes: decompressed,
          name: newName
        });

      } else {
        // 🔼 Otherwise compress
        const compressed = compress(file.bytes);

        outputFiles.push({
          bytes: compressed,
          name: `${file.name}.zst`
        });
      }
    }

    return outputFiles;
  }
}

export default zstdHandler;
