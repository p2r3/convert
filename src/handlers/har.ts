import { FormatDefinition } from "../FormatHandler.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats, { Category } from "src/CommonFormats.ts";
import JSZip from "jszip";

const harFormat = new FormatDefinition(
    "HTTP Archive",
    "har",
    "har",
    "application/har+json",
    Category.ARCHIVE
);

class harHandler implements FormatHandler {

  public name: string = "har";
  public ready: boolean = true;

  public supportedFormats?: FileFormat[] = [
    harFormat.builder("har").allowFrom(),
    CommonFormats.ZIP.builder("zip").allowTo()
  ];

  async init () {
  }

  private base64ToUint8Array(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const length = binaryString.length;
    const bytes = new Uint8Array(length);

    for (let i = 0; i < length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    return bytes;
  }

  private async convertHarToZip(inputFile: FileData): Promise<FileData> {
    const zip = new JSZip();
    const textEncoder = new TextEncoder();
    const textDecoder = new TextDecoder();

    const text = textDecoder.decode(inputFile.bytes);
    const json = JSON.parse(text);
    const entries = json.log.entries;
    for (const entry of entries) {
      if (!entry?.request?.url) continue;
      if (!entry?.response?.content?.text) continue;

      const url = new URL(entry.request.url);
      let pathName = url.host + url.pathname;
      const fileName = pathName.split("/").at(-1);
      if (entry.response.content.mimeType?.includes("text/html") && !fileName.endsWith(".html")) {
        if (pathName[pathName.length-1] !== "/") pathName += "/";
        pathName += "index.html";
      }

      const content = entry.response.content;
      let contentData;
      if (content.encoding === "base64") {
        contentData = this.base64ToUint8Array(content.text);
      } else {
        contentData = textEncoder.encode(entry.response.content.text);
      }
      zip.file(pathName, contentData);
    }

    let newName = inputFile.name;
    if (newName.endsWith(".har")) newName = newName.slice(0, -4);
    newName += ".zip";
    return {
      name: newName,
      bytes: await zip.generateAsync({ type: "uint8array" })
    };
  }

  async doConvert (
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];
    for (const inputFile of inputFiles) {
      outputFiles.push(await this.convertHarToZip(inputFile));
    }
    return outputFiles;
  }

}

export default harHandler;
