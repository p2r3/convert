import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

import headUrl from "./batToExe/exe65824head.bin?url";
import footUrl from "./batToExe/exe65824foot.bin?url";

class batToExeHandler implements FormatHandler {
  public name = "batToExe";
  public supportedFormats = [
    { name: "Windows Batch file",       format: "batch",      extension: "text/bat", mime: "text/windows-batch", from: true,  to: false, internal: "bat", category: "text" },
    { name: "Windows 64bit Executable", format: "executable", extension: "exe",      mime: "binary/exe-win64",   from: false, to: true,  internal: "exe", category: "binary", lossless: true } // Tecnically it lossless because stores bat inside
  ];
  public ready = false;

  private header: Uint8Array|null = null;
  private footer: Uint8Array|null = null;

  async init() {
    this.header = await fetch(headUrl).then(res => res.arrayBuffer()).then(buf => new Uint8Array(buf));
    this.footer = await fetch(footUrl).then(res => res.arrayBuffer()).then(buf => new Uint8Array(buf));;
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {

    const header = this.header;
    const footer = this.footer;
    if (!this.ready || !header || !footer) throw "Handler not initialized!";

    const CONTENT_SIZE = 65824;
    const EXIT_BYTES = new Uint8Array([0x0d, 0x0a, 0x65, 0x78, 0x69, 0x74]); // \r\nexit
    const PAD_BYTE = 0x20; // space

    const outputFiles: FileData[] = [];

    for (const file of inputFiles) {
      if (inputFormat.internal !== "bat" || outputFormat.internal !== "exe") {
        throw new Error("Invalid output format.");
      }

      if (file.bytes.length + EXIT_BYTES.length > CONTENT_SIZE) {
        throw new Error("Input too long. Max 65818 bytes.");
      }

      // Build padded content block
      const content = new Uint8Array(CONTENT_SIZE);
      content.fill(PAD_BYTE);
      content.set(file.bytes, 0);
      content.set(EXIT_BYTES, file.bytes.length);

      // Assemble final EXE
      const out = new Uint8Array(header.length + CONTENT_SIZE + footer.length);

      let offset = 0;
      out.set(header, offset);
      offset += header.length;
      out.set(content, offset);
      offset += CONTENT_SIZE;
      out.set(footer, offset);

      const outputName =
        file.name.split(".").slice(0, -1).join(".") +
        "." +
        outputFormat.extension;

      outputFiles.push({
        name: outputName,
        bytes: out,
      });
    }

    return outputFiles;
  }
}

export default batToExeHandler;
