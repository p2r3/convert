import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

class txtToHraHandler implements FormatHandler {
  public name: string = "txt2hra";

  public supportedFormats: FileFormat[] = [
    {
      name: "Plain Text",
      format: "txt",
      extension: "txt",
      mime: "text/plain",
      from: false,
      to: false,
      internal: "txt"
    },
    {
      name: "Human Readable Archive",
      format: "hra",
      extension: "hra",
      mime: "archive/x-hra",
      from: false,
      to: true,
      internal: "hra"
    }
  ];

  public ready: boolean = true;

  async init() {
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {
    if (inputFormat.internal !== "txt" || outputFormat.internal !== "hra") {
      throw "Unsupported format conversion for txt2hra handler.";
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    return inputFiles.map(file => {
      const txt = decoder.decode(file.bytes);
      const script = `<~= HRA File =~>\n<= File => ${file.name}\n${txt}'@`;
      const newName = file.name.replace(/\.[^.]+$/, "." + outputFormat.extension);
      return { name: newName, bytes: encoder.encode(script) } as FileData;
    });
  }
}

export default txtToHraHandler;
