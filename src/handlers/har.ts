import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import Formats, { SpecialFormats } from "src/Formats.ts";
import { decode, encode, getExt, stripExt } from "src/common/index.ts";
import { extractedParent, splitPath } from "src/common/path.ts";

class harHandler implements FormatHandler {
  public readonly name = "har";
  public supportedFormats = [
    Formats.HAR.builder("har").from(),
    SpecialFormats.ANY.builder("ANY").to(),
  ];
  public ready = false;

  async init() {
    this.ready = true;
  }

  private extractResponses(inputFile: FileData): FileData[] {
    const files: FileData[] = [];
    const json = JSON.parse(decode(inputFile.bytes));
    for (const entry of json.log.entries) {
      if (!entry?.request?.url) continue;
      if (!entry?.response?.content?.text) continue;

      const url = new URL(entry.request.url);
      let pathName = url.host + url.pathname;
      const fileName = pathName.split("/").at(-1)!;
      if (entry.response.content.mimeType?.includes("text/html") && !fileName.endsWith(".html")) {
        if (pathName[pathName.length - 1] !== "/") pathName += "/";
        pathName += "index.html";
      }
      if (url.search) {
        const slash = pathName.lastIndexOf("/");
        const dir = pathName.slice(0, slash + 1);
        const file = pathName.slice(slash + 1) || "index";
        const query = url.search
          .slice(1)
          .replaceAll(/[\\/:*?"<>|]/g, "_")
          .slice(0, 100);
        const ext = getExt(file);
        pathName = `${dir}${stripExt(file)}_${query}${ext ? `.${ext}` : ""}`;
      }

      const content = entry.response.content;
      const bytes =
        content.encoding === "base64" ? Uint8Array.fromBase64(content.text) : encode(content.text);
      files.push({ name: pathName, bytes });
    }
    return files;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];
    for (const inputFile of inputFiles) {
      const parent = extractedParent(inputFile, inputFiles.length > 1);
      for (const { name, bytes } of this.extractResponses(inputFile)) {
        if (bytes.length) outputFiles.push({ ...splitPath(name, parent), bytes });
      }
    }
    return outputFiles;
  }
}

export default harHandler;
