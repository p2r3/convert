import CommonFormats from "src/CommonFormats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

class csharpHandler implements FormatHandler {

  public name = "csharpHandler";

  public supportedFormats: FileFormat[] = [
    CommonFormats.TEXT.supported("txt", true, false, true),
    {
      name: "C# Source File",
      format: "cs",
      extension: "cs",
      mime: "text/csharp",
      from: false,
      to: true,
      internal: "csharp",
      category: "code",
      lossless: true,
    }
  ];

  public ready: boolean = true;

  async init() {
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {
    if (inputFormat.internal !== "txt") {
      throw "Invalid input format.";
    }

    if (outputFormat.internal !== "csharp") {
      throw "Invalid output format.";
    }

    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    return inputFiles.map(file => {
      const text = decoder.decode(file.bytes)
        .replace(/\r?\n/, "\n")

        // Content of the .txt file will be translated to a C# verbatim string,
        // so quotes must be escaped using the verbatim string escape syntax (two double quotes, "")
        // instead of the usual \" escape.
        .replaceAll("\"", "\"\"");

      let output = "";

      output = "using System;\n\n";

      // In modern C#, top level statements are preferred over the old 'void Main(string[] args)' method.
      output += `Console.WriteLine(@"${text}");\n\n`;

      // Ensure that the console doesn't close immediately after writing the text.
      output += "Console.Read();\n";

      const name = file.name.split(".")[0] + ".cs";
      return {
        name,
        bytes: encoder.encode(output)
      };
    });
  }
}

export default csharpHandler;
