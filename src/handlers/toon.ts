import { FormatDefinition } from "../FormatHandler.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats, { Category } from "src/CommonFormats.ts";
import { encode, decode } from "@toon-format/toon";

const toonFormat = new FormatDefinition(
  "Token-Oriented Object Notation",
  "toon",
  "toon",
  "text/toon",
  Category.DATA
);

class toonHandler implements FormatHandler {

  public name: string = "toon";

  public supportedFormats?: FileFormat[] = [
    CommonFormats.JSON.supported("json", true, true, true),
    toonFormat.supported("toon", true, true, true)
  ];

  public ready: boolean = false;

  async init() {
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {
    switch (inputFormat.mime) {
      case CommonFormats.JSON.mime:
        if (outputFormat.mime !== toonFormat.mime) {
          throw "Unsupported output format";
        }

        return inputFiles.map(file => {
          const text = new TextDecoder().decode(file.bytes);
          let jsonData = JSON.parse(text);

          const toonData = encode(jsonData);
          const name = file.name.split(".")[0] + ".toon";

          return {
            name,
            bytes: new TextEncoder().encode(toonData)
          };
        });

      case toonFormat.mime:
        if (outputFormat.mime !== CommonFormats.JSON.mime) {
          throw "Unsupported output format";
        }

        return inputFiles.map(file => {
          const toonData = new TextDecoder().decode(file.bytes);
          const jsonData = JSON.stringify(decode(toonData));

          const name = file.name.split(".")[0] + ".json";

          return {
            name,
            bytes: new TextEncoder().encode(jsonData)
          };
        });

      default:
        throw "Unsupported input format";
    }
  }
}

export default toonHandler;
