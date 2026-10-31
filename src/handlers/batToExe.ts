import Formats from "src/Formats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import { InitializationError } from "src/errors.ts";

import headUrl from "./batToExe/exe65824head.bin?url";
import footUrl from "./batToExe/exe65824foot.bin?url";
import { changeExt } from "src/common/index.ts";

class batToExeHandler implements FormatHandler {
  public readonly name = "batToExe";
  public supportedFormats = [
    Formats.BATCH.builder("bat").from(),
    Formats.EXE.builder("exe").lossless().to(), // Lossless because it stores exact input side
  ];
  public ready = false;

  private header: Uint8Array | null = null;
  private footer: Uint8Array | null = null;

  async init() {
    this.header = await fetch(headUrl).then((res) => res.bytes());
    this.footer = await fetch(footUrl).then((res) => res.bytes());
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {
    const header = this.header;
    const footer = this.footer;
    if (!this.ready || !header || !footer)
      throw new InitializationError("Handler not initialized.");

    const CONTENT_SIZE = 65824;
    const EXIT_BYTES = new Uint8Array([0x0d, 0x0a, 0x65, 0x78, 0x69, 0x74]); // \r\nexit
    const PAD_BYTE = 0x20; // space

    const outputFiles: FileData[] = [];

    for (const file of inputFiles) {
      if (inputFormat.internal !== "bat") {
        throw new TypeError(`Unsupported input format: ${inputFormat.internal}`);
      }
      if (outputFormat.internal !== "exe") {
        throw new TypeError(`Unsupported output format: ${outputFormat.internal}`);
      }

      if (file.bytes.length + EXIT_BYTES.length > CONTENT_SIZE) {
        throw new RangeError(`Input too long. Max ${CONTENT_SIZE - EXIT_BYTES.length} bytes.`);
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

      const outputName = changeExt(file.name, outputFormat.extension);

      outputFiles.push({
        name: outputName,
        bytes: out,
      });
    }

    return outputFiles;
  }
}

export default batToExeHandler;
