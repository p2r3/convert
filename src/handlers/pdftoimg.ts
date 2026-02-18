import CommonFormats from "src/CommonFormats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

import { pdfToImg } from "pdftoimg-js/browser";

function base64ToBytes (base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

class pdftoimgHandler implements FormatHandler {

  public name: string = "pdftoimg";

  public supportedFormats: FileFormat[] = [
    {
      name: "Portable Document Format",
      format: "pdf",
      extension: "pdf",
      mime: "application/pdf",
      from: true,
      to: false,
      internal: "pdf",
      category: "document"
    },
    CommonFormats.PNG.supported("png", false, true),
    CommonFormats.JPEG.supported("jpeg", false, true),
  ];

  public ready: boolean = true;

  async init () {
    this.ready = true;
  }

  async doConvert (
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {

    if (
      outputFormat.format !== "png"
      && outputFormat.format !== "jpg"
    ) throw "Invalid output format.";

    const outputFiles: FileData[] = [];

    for (const inputFile of inputFiles) {

      const blob = new Blob([inputFile.bytes as BlobPart], { type: inputFormat.mime });
      const url = URL.createObjectURL(blob);

      const images = await pdfToImg(url, {
        imgType: outputFormat.format,
        pages: "all"
      });

      const baseName = inputFile.name.split(".")[0];

      for (let i = 0; i < images.length; i++) {
        const base64 = images[i].slice(images[i].indexOf(";base64,") + 8);
        const bytes = base64ToBytes(base64);
        const name = `${baseName}_${i}.${outputFormat.extension}`;
        outputFiles.push({ bytes, name });
      }

    }

    return outputFiles;

  }

}

export default pdftoimgHandler;
