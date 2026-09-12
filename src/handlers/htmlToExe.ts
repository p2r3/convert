import JSZip from "jszip";
import CommonFormats from "src/CommonFormats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import { EOFError, InitializationError } from "src/errors.ts";

import stubUrl from "./htmlToExe/win-x64.bin?url";

const FOOTER_MAGIC = "HXEZ";
const FOOTER_SIZE = 12; // 4 bytes magic + 4 bytes offset (u32 LE) + 4 bytes length (u32 LE)

class htmlToExeHandler implements FormatHandler {
  public name = "htmlToExe";
  public supportedFormats: FileFormat[] = [
    CommonFormats.HTML.builder("html")
      .markLossless()
      .allowFrom(true)
      .allowTo(false),
      CommonFormats.EXE.supported("exe", false, true, true) // Lossless because it stores exact input side
  ]
  public ready = false;

  private stub: Uint8Array | null = null;

  async init() {
    this.stub = await fetch(stubUrl).then(res => res.arrayBuffer()).then(buf => new Uint8Array(buf));
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {

    const stub = this.stub;
    if (!this.ready || !stub) throw new InitializationError("Handler not initialized.");

    const outputFiles: FileData[] = [];

    for (const file of inputFiles) {
      if (inputFormat.internal !== "html") {
        throw new TypeError(`Unsupported input format: ${inputFormat.internal}`);
      }
      if (outputFormat.internal !== "exe") {
        throw new TypeError(`Unsupported output format: ${outputFormat.internal}`);
      }

      const path = "./index.html";
      const bytes = new Uint8Array(file.bytes);

      // Zip deterministically. STORE avoids re-encoding assets that
      // are often already compressed (images, fonts); switch to
      // DEFLATE later if output size matters more than build speed.
      const outputArchive = new JSZip();
      
      outputArchive.file(path, bytes, { compression: "STORE" });
      const projectZip = await outputArchive.generateAsync({
        type: "uint8array",
        compression: "STORE",
      });

      // Build the footer. Offset points to where the appended zip
      // begins, i.e. right after the stub.
      const offset = stub.length;
      const footer = new Uint8Array(FOOTER_SIZE);
      const view = new DataView(footer.buffer);
      new TextEncoder().encodeInto(FOOTER_MAGIC, footer.subarray(0, 4));
      view.setUint32(4, offset, true);
      view.setUint32(8, projectZip.length, true);

      // Assemble final EXE: stub + zip + footer
      const out = new Uint8Array(stub.length + projectZip.length + footer.length);
      let cursor = 0;
      out.set(stub, cursor);
      cursor += stub.length;
      out.set(projectZip, cursor);
      cursor += projectZip.length;
      out.set(footer, cursor);

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

export default htmlToExeHandler;