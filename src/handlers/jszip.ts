import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import JSZip from "jszip";

class jszipHandler implements FormatHandler {

  public name: string = "jszip";

  public supportedFormats: FileFormat[] = [
    {
      name: "ZIP Archive",
      format: "zip",
      extension: "zip",
      mime: "application/zip",
      from: false,
      to: true,
      internal: "zip",
      category: "archive",
      lossless: true
    }
  ];

  public supportAnyInput: boolean = true;

  public ready: boolean = false;

  async init() {
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {

    const outputFiles: FileData[] = [];
    const zip = new JSZip();

    for (const file of inputFiles) {
      zip.file(file.name, file.bytes);
    }

    const output = await zip.generateAsync({ type: "uint8array" });

    outputFiles.push({ bytes: output, name: "output.zip" });
    return outputFiles;
  }
}

export default jszipHandler;
