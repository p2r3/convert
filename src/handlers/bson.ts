import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import Formats from "src/Formats.ts";
import { BSON } from "bson";
import { changeExt, decode, encode, ownedBytes } from "src/common/index.ts";

class bsonHandler implements FormatHandler {
  public readonly name = "bson";
  public supportedFormats = [
    Formats.JSON.builder("json").lossless().fromTo(),
    Formats.BSON.builder("bson").lossless().fromTo(),
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
    switch (inputFormat.mime) {
      case Formats.JSON.mime:
        if (outputFormat.mime !== Formats.BSON.mime) {
          throw new TypeError(`Unsupported output format: ${outputFormat.internal}`);
        }

        return inputFiles.map((file) => {
          const text = decode(file.bytes);
          let jsonData = JSON.parse(text);

          // BSON required the root to be an object.
          if (Array.isArray(jsonData)) {
            jsonData = { root: jsonData };
          }

          const bsonResult = BSON.serialize(jsonData);
          const name = changeExt(file.name, "bson");

          return {
            name,
            bytes: ownedBytes(bsonResult),
          };
        });

      case Formats.BSON.mime:
        if (outputFormat.mime !== Formats.JSON.mime) {
          throw new TypeError(`Unsupported output format: ${outputFormat.internal}`);
        }

        return inputFiles.map((file) => {
          const bsonData = BSON.deserialize(file.bytes);
          const text = JSON.stringify(bsonData);

          const name = changeExt(file.name, "json");

          return {
            name,
            bytes: encode(text),
          };
        });

      default:
        throw new TypeError(`Unsupported input format: ${inputFormat.internal}`);
    }
  }
}

export default bsonHandler;
