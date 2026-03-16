import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats from "src/CommonFormats.ts";

class mclangHandler implements FormatHandler {

  public name: string = "minecraft-lang";
  public supportedFormats?: FileFormat[];
  public ready: boolean = false;

  async init () {
    this.supportedFormats = [
      CommonFormats.JSON.builder("json")
        .markLossless(true)
        .allowFrom(true)
        .allowTo(true),

        {
            name: "Minecraft Language Localization File",
            format: "minecraft-lang",
            extension: "lang",
            mime: "text/plain",
            from: true,
            to: true,
            internal: "minecraft-lang",
            lossless: true,
        }
    ];
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
    ): Promise<FileData[]> {

    const outputFiles: FileData[] = [];

    for (const file of inputFiles) {

        const text = new TextDecoder().decode(file.bytes);

        let resultText: string;

        // JSON → LANG
        if (inputFormat.format === "json" && outputFormat.format === "minecraft-lang") {
        const obj = JSON.parse(text);

        if (typeof obj !== "object" || Array.isArray(obj)) {
            throw new Error("JSON must be a flat object");
        }

        resultText = Object.entries(obj)
            .map(([k, v]) => `${k}=${v}`)
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
        }

        else {
        throw new Error("Unsupported conversion direction");
        }

        outputFiles.push({
        name: file.name.split(".").slice(0, -1).join("."),
        bytes: new TextEncoder().encode(resultText)
        });
    }

    return outputFiles;
    }

}

export default mclangHandler;