import { FormatDefinition } from "../FormatHandler.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats, { Category } from "src/CommonFormats.ts";
import { BSON } from "bson";

const bsonFormat = new FormatDefinition(
  "Binary JSON",
  "bson",
  "bson",
  "application/bson",
  Category.DATA
);

class bsonHandler implements FormatHandler {

  public name: string = "bson";

  public supportedFormats?: FileFormat[] = [
    CommonFormats.JSON.supported("json", true, true, true),
    bsonFormat.supported("bson", true, true, true)
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
        if (outputFormat.mime !== bsonFormat.mime) {
          throw "Unsupported output format";
        }

        return inputFiles.map(file => {
          const text = new TextDecoder().decode(file.bytes);
          let jsonData = JSON.parse(text);

          // BSON required the root to be an object.
          if (Array.isArray(jsonData)) {
            jsonData = { root: jsonData };
          }

          const bsonResult = BSON.serialize(jsonData);
          const name = file.name.split(".")[0] + ".bson";

          return {
            name,
            bytes: bsonResult
          };
        });

      case bsonFormat.mime:
        if (outputFormat.mime !== CommonFormats.JSON.mime) {
          throw "Unsupported output format";
        }

        return inputFiles.map(file => {
          const bsonData = BSON.deserialize(file.bytes);
          const text = JSON.stringify(bsonData);

          const name = file.name.split(".")[0] + ".json";

          return {
            name,
            bytes: new TextEncoder().encode(text)
          };
        });

      default:
        throw "Unsupported input format";
    }
  }
}

export default bsonHandler;
