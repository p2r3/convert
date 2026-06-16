import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats from "src/CommonFormats.ts";
import JSZip from "jszip";

class krzHandler implements FormatHandler {
  public name: string = "krz";
  public supportedFormats?: FileFormat[];
  public ready: boolean = false;

  async init() {
    this.supportedFormats = [
      CommonFormats.PNG.builder("png")
        .markLossless()
        .allowFrom(false)
        .allowTo(true),

      {
        name: "Krita Raster Archive (krz)",
        format: "krz",
        extension: "krz",
        mime: "application/x-krita",
        from: true,
        to: false,
        internal: "krz",
        category: ["archive"],
        lossless: true,
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
          name: inputFile.name.replace(/\.krz$/, ".png"),
          bytes: imageData,
        });
      }
    }

    return outputFiles;
  }
}

export default krzHandler;
