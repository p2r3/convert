import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import Formats from "src/Formats.ts";
import JSZip from "jszip";
import { decode, encode } from "src/common/index.ts";

class harHandler implements FormatHandler {
  public readonly name = "har";
  public supportedFormats = [Formats.HAR.builder("har").from(), Formats.ZIP.builder("zip").to()];
  public ready = false;

  async init() {
    this.ready = true;
  }

  private async convertHarToZip(inputFile: FileData): Promise<FileData> {
    const zip = new JSZip();

    const text = decode(inputFile.bytes);
    const json = JSON.parse(text);
    const entries = json.log.entries;
    for (const entry of entries) {
      if (!entry?.request?.url) continue;
      if (!entry?.response?.content?.text) continue;

      const url = new URL(entry.request.url);
      let pathName = url.host + url.pathname;
      const fileName = pathName.split("/").at(-1)!;
      if (entry.response.content.mimeType?.includes("text/html") && !fileName.endsWith(".html")) {
        if (pathName[pathName.length - 1] !== "/") pathName += "/";
        pathName += "index.html";
      }

      const content = entry.response.content;
      let contentData;
      if (content.encoding === "base64") {
        contentData = Uint8Array.fromBase64(content.text);
      } else {
        contentData = encode(entry.response.content.text);
      }
      zip.file(pathName, contentData);
    }

    let newName = inputFile.name;
    if (newName.endsWith(".har")) newName = newName.slice(0, -4);
    newName += ".zip";
    return {
      name: newName,
      bytes: await zip.generateAsync({ type: "uint8array" }),
    };
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];
    for (const inputFile of inputFiles) {
      outputFiles.push(await this.convertHarToZip(inputFile));
    }
    return outputFiles;
  }
}

export default harHandler;
