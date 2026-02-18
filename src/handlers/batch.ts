import CommonFormats from "src/CommonFormats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

class batchHandler implements FormatHandler {
  public name = "batch";
  public supportedFormats = [
    CommonFormats.TEXT.supported("txt", true, false),
    CommonFormats.BATCH.supported("bat", false, true, true),
  ];
  public ready = false;

  async init() {
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {
    
    const outputFiles: FileData[] = [];

    for (const file of inputFiles) {
      
      const dec = new TextDecoder().decode(file.bytes);
      let out = "";

      if (inputFormat.internal === "txt" && outputFormat.internal === "bat") {

        const lines = dec.split(/\r?\n/);

        const escapeBat = (line: string) => {
          const buf: string[] = [];
          for (const ch of line) {
            switch (ch) {
              case "%": buf.push("%%"); break;
              case "^": buf.push("^^"); break;
              case "&": buf.push("^&"); break;
              case "|": buf.push("^|"); break;
              case "<": buf.push("^<"); break;
              case ">": buf.push("^>"); break;
              case "!": buf.push("^^!"); break;
              default:  buf.push(ch);
            }
          }
          // This avoids repeated string reallocation.
          return buf.join("");
        };


        out = "@echo off\r\n";

        for (const line of lines) {
          if (line === "") {
            out += "echo.\r\n";
          } else {
            out += `echo ${escapeBat(line)}\r\n`;
          }
        }
        // Add a pause at the end to keep the window open
        out += "pause\r\n"; 

      } else {
        throw new Error("Invalid output format.");
      }

      const outputName =
        file.name.split(".").slice(0, -1).join(".") +
        "." +
        outputFormat.extension;

      outputFiles.push({
        name: outputName,
        bytes: new TextEncoder().encode(out),
      });
    }

    return outputFiles;
  }
}

export default batchHandler;