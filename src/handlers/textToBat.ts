import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

class textToBatHandler implements FormatHandler {

  public name: string = "textToBat";

  public supportedFormats: FileFormat[] = [
    {
      name: "Plain Text",
      format: "text",
      extension: "txt",
      mime: "text/plain",
      from: true,
      to: false,
      internal: "text"
    },
    {
      name: "Windows Batch file",
      format: "batch",
      extension: "text/bat",
      mime: "text/windows-batch",
      from: false,
      to: true,
      internal: "bat"
    },
  ];

  public supportAnyInput: boolean = false;

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

    for (const file of inputFiles) {
      const dec = new TextDecoder("utf-8");
      let text = dec.decode(file.bytes)
        // Escape special characters
        .replaceAll("%","%%")
        .replaceAll(/[&><^()|"]/g, function (x) { return `^${x}`; })
        // New lines
        .replaceAll("\n","\nECHO.");

      let newText = `@ECHO OFF\nECHO ${text}`;

      const utf8Bytes = new TextEncoder().encode(newText);

      const name = file.name.split(".")[0] + "." + "bat";

      outputFiles.push({bytes: utf8Bytes, name: name})
    }

    return outputFiles;
  }
}

export default textToBatHandler;
