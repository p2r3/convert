// file: mmlwrap.ts
// basic MathML to HTML conversion, embeds the contents of the file into an HTML.
// note: only supports generic MathML. any other MathMLs are not supported.

import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats from "src/CommonFormats.ts";

class mmlwrapHandler implements FormatHandler {

  public name: string = "mmlwrap";
  public supportedFormats?: FileFormat[];
  public ready: boolean = false;

  async init () {
    this.supportedFormats = [
      // Example PNG format, with both input and output disabled
      /* CommonFormats.PNG.builder("png")
        .markLossless()
        .allowFrom(false)
        .allowTo(false), */

      // Alternatively, if you need a custom format, define it like so:
      {
        name: "Mathematical Markup Language (MathML)",
        format: "MathML",
        extension: "mml",
        mime: "application/mathml+xml",
        from: true,
        to: false,
        category: "document",
      },
      CommonFormats.HTML.supported("html",false,true)
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
      const intext = await file.text();
      const out = `<math>${content}</math>`;
      const outputName =
        file.name.split(".").slice(0, -1).join(".") +
        ".html"
    outputFiles.push({
        name: outputName,
        bytes: out,
      });
    }
    return outputFiles;
  }

}

export default mmlwrapHandler;
