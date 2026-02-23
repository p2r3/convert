import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import { parse, stringify } from "smol-toml";
import CommonFormats from "src/CommonFormats.ts";

class tomlHandler implements FormatHandler {
  public name: string = "toml";
  public supportedFormats?: FileFormat[];
  public ready: boolean = false;

  async init() {
    this.supportedFormats = [
      {
        name: "Tom's Obvious, Minimal Language",
        format: "toml",
        extension: "toml",
        mime: "application/toml",
        from: true,
        to: false,
        internal: "toml",
        category: "text",
        lossless: true
      },
      CommonFormats.JSON.supported("json", false, true, true),
    ];
    this.ready = true;
  }

  async doConvert(
        inputFiles: FileData[],
        inputFormat: FileFormat,
        outputFormat: FileFormat
      ): Promise<FileData[]> {
        const outputFiles: FileData[] = [];
        const decoder = new TextDecoder()
        const encoder = new TextEncoder()

        // toml -> json, hopefully json -> toml later im just too newbie at this
        if (inputFormat.internal == "toml" && outputFormat.internal == "json") {
            for (const file of inputFiles) {
                const bytes = decoder.decode(file.bytes);
                const data = parse(bytes);
                const string = JSON.stringify(data, null, 2);
                const output = encoder.encode(string);

                outputFiles.push({
                    name: file.name.split(".")[0] + ".json",
                    bytes: output,
                });
            }
        }
    return outputFiles
  }
}

export default tomlHandler;