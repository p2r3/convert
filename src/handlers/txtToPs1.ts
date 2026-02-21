import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

class txtToPs1Handler implements FormatHandler {
  public name: string = "txt2ps1";

  public supportedFormats: FileFormat[] = [
    {
      name: "Plain Text",
      format: "txt",
      extension: "txt",
      mime: "text/plain",
      from: true,
      to: false,
      internal: "txt"
    },
    {
      name: "PowerShell Script",
      format: "ps1",
      extension: "ps1",
      mime: "text/x-powershell",
      from: false,
      to: true,
      internal: "ps1"
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
    // Only handle txt -> ps1 conversion
    if (inputFormat.internal !== "txt" || outputFormat.internal !== "ps1") {
      throw "Unsupported format conversion for txt2ps1 handler.";
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    return inputFiles.map(file => {
      const txt = decoder.decode(file.bytes);
      const script = `Write-Host @'\n${txt}\n'@`;
      const newName = file.name.replace(/\.[^.]+$/, "." + outputFormat.extension);
      return { name: newName, bytes: encoder.encode(script) } as FileData;
    });
  }
}

export default txtToPs1Handler;
