import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats from "src/CommonFormats.ts";
import JSZip from "jszip";

class kraHandler implements FormatHandler {
  public name: string = "kra";
  public supportedFormats?: FileFormat[];
  public ready: boolean = false;

  async init() {
    this.supportedFormats = [
      CommonFormats.PNG.builder("png").allowFrom(false).allowTo(true),

      {
        name: "Krita Raster Archive (KRA)",
        format: "kra",
        extension: "kra",
        mime: "application/x-krita",
        from: true,
        to: false,
        internal: "kra",
        category: ["archive"],
        lossless: false,
      },
    ];
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];
    if (inputFormat.format == "kra" && outputFormat.format == "png") {
      for (const inputFile of inputFiles) {
        const zip = new JSZip();
        const zipContent = await zip.loadAsync(inputFile.bytes);
        let imageFile;

        try {
          imageFile = zipContent.file("mergedimage.png");

          if (!imageFile) {
            throw new Error();
          }
        } catch {
          imageFile = zipContent.file("preview.png");

          if (!imageFile) {
            throw new Error("Could not find image in KRA file");
          }
        }
        const imageData = await imageFile.async("uint8array");
        outputFiles.push({
          name: inputFile.name.replace(/\.kra$/, ".png"),
          bytes: imageData,
        });
      }
    }

    return outputFiles;
  }
}

export default kraHandler;
