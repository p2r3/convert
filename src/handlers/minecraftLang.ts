import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import Formats from "src/Formats.ts";
import { changeExt, decode, encode } from "src/common/index.ts";

class minecraftLangHandler implements FormatHandler {
  public readonly name = "minecraftLang";
  public supportedFormats = [
    Formats.JSON.builder("json").lossless().fromTo(),
    Formats.MC_LANG.builder("minecraft-lang").lossless().fromTo(),
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
    const outputFiles: FileData[] = [];

    for (const file of inputFiles) {
      const text = decode(file.bytes);

      let resultText: string;

      // JSON → LANG
      if (inputFormat.format === "json" && outputFormat.format === "minecraft-lang") {
        const obj = JSON.parse(text);

        if (typeof obj !== "object" || Array.isArray(obj)) {
          throw new TypeError("JSON must be a flat object");
        }

        resultText = Object.entries(obj)
          .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
          .join("\n");
      }

      // LANG → JSON
      else if (inputFormat.format === "minecraft-lang" && outputFormat.format === "json") {
        const result: Record<string, string> = {};

        const lines = text.split(/\r?\n/);

        for (const line of lines) {
          if (!line.trim() || line.startsWith("#")) continue;

          const index = line.indexOf("=");

          if (index === -1) continue;

          const key = line.slice(0, index).trim();
          const value = line.slice(index + 1).trim();

          result[key] = value;
        }

        resultText = JSON.stringify(result, null, 2);
      } else {
        throw new TypeError(
          `Unsupported conversion direction: ${inputFormat.internal} -> ${outputFormat.internal}`,
        );
      }

      outputFiles.push({
        name: changeExt(file.name, outputFormat.extension),
        bytes: encode(resultText),
      });
    }

    return outputFiles;
  }
}

export default minecraftLangHandler;
