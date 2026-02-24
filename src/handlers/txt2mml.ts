// file: txt2mml.ts

import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats from "src/CommonFormats.ts";

class txt2mmlHandler implements FormatHandler {

  public name: string = "txt2mml";
  public supportedFormats?: FileFormat[];
  public ready: boolean = false;

  async init () {
    this.supportedFormats = [
      CommonFormats.TEXT.builder("txt")
        .allowFrom(true)
        .allowTo(false),
      {
        name: "Mathematical Markup Language (MathML)",
        format: "mathml",
        extension: "mml",
        mime: "application/mathml+xml",
        from: false,
        to: true,
        internal: "mathml",
        category: ["text", "document"],
      },
    ];
    this.ready = true;
  }

  async doConvert (
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];
    for (const file of inputFiles) {
      const intext = await (file as unknown as File).text();
      const wraptext = `<mtext>${intext}</mtext>`;
      const outname = file.name.split(".").slice(0, -1).join(".")+".mml";
      outputFiles.push({name: outname, bytes: new TextEncoder().encode(wraptext)})
    }
    return outputFiles;
  }

}

export default txt2mmlHandler;
