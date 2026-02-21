import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

class ps1ToTxtHandler implements FormatHandler {
  public name: string = "ps1ToTxt";

  public supportedFormats: FileFormat[] = [
    {
      name: "PowerShell Script",
      format: "ps1",
      extension: "ps1",
      mime: "text/x-powershell",
      from: true,
      to: false,
      internal: "ps1"
    },
    {
      name: "Plain Text",
      format: "txt",
      extension: "txt",
      mime: "text/plain",
      from: false,
      to: true,
      internal: "txt"
    }
  ];

  public ready: boolean = true;

  async init() { this.ready = true; }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {
    if (inputFormat.internal !== "ps1" || outputFormat.internal !== "txt") {
      throw "Unsupported format conversion for ps1ToTxt handler.";
    }
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    return inputFiles.map(file => {
      const script = decoder.decode(file.bytes);
      const match = script.match(/Write-Host\s+@'([\s\S]*?)'@/);
      const extracted = match ? match[1].replace(/^\n/, '') : "";
      const newName = file.name.replace(/\.[^.]+$/, "." + outputFormat.extension);
      return { name: newName, bytes: encoder.encode(extracted) } as FileData;
    });
  }
}

export default ps1ToTxtHandler;
