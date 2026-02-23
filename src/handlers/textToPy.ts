import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats from "../CommonFormats.ts";

class txtToPyHandler implements FormatHandler {

  public name: string = "Text to Python Script";
  public ready: boolean = true;
  
  public supportedFormats: FileFormat[] = [
    CommonFormats.TEXT.supported("txt", true, false),
    CommonFormats.PYTHON.supported("py", false, true, true)
  ];

  async init() {
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    for (const inputFile of inputFiles) {
      const textContent = decoder.decode(inputFile.bytes);
      const scriptContent = `print(${JSON.stringify(textContent)})`;

      const outputBytes = encoder.encode(scriptContent);
      const newName = inputFile.name.replace(/\.[^/.]+$/, "") + ".py";
      
      outputFiles.push({ bytes: outputBytes, name: newName });
    }

    return outputFiles;
  }
}

export default txtToPyHandler;
