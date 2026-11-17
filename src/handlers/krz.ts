import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import Formats from "src/Formats.ts";
import JSZip from "jszip";
import { changeExt, ownedBytes } from "src/common/index.ts";

class krzHandler implements FormatHandler {
  public readonly name = "krz";
  public supportedFormats = [Formats.PNG.builder("png").to(), Formats.KRZ.builder("krz").from()];
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
    if (inputFormat.format == "krz" && outputFormat.format == "png") {
      for (const inputFile of inputFiles) {
        const zip = new JSZip();
        const zipContent = await zip.loadAsync(inputFile.bytes);
        const imageFile = zipContent.file("preview.png");

        if (!imageFile) {
          throw new Error("Could not find image in krz file");
        }

        const imageData = await imageFile.async("uint8array");
        outputFiles.push({
          name: changeExt(inputFile.name, "png"),
          bytes: ownedBytes(imageData),
        });
      }
    }

    return outputFiles;
  }
}

export default krzHandler;
