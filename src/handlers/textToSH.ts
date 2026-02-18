import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

class textToSHHandler implements FormatHandler {

  public name: string = "textToSH";

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
      name: "Shell Script",
      format: "sh",
      extension: "sh",
      mime: "application/x-sh",
      from: false,
      to: true,
      internal: "sh"
    }
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
      let text = dec.decode(file.bytes).replaceAll("\"", "\\\"");

      let newText = `#!/bin/sh\necho "${text}"`;

      const utf8Bytes = new TextEncoder().encode(newText);

      const name = file.name.split(".")[0] + "." + outputFormat.extension;

      outputFiles.push({bytes: utf8Bytes, name: name})
    }

    return outputFiles;
  }
}

export default textToSHHandler;
