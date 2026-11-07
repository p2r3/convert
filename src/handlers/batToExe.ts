import Formats from "src/Formats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import { InitializationError } from "src/errors.ts";

import stubUrl from "built/battoexe/stub.exe?url";
import { changeExt } from "src/common/index.ts";

const MAGIC = new TextEncoder().encode("CONVERT\0");

class batToExeHandler implements FormatHandler {
  public readonly name = "batToExe";
  public supportedFormats = [
    Formats.BATCH.builder("bat").from(),
    Formats.EXE.builder("exe").lossless().to(), // Lossless because it stores exact input side
  ];
  public ready = false;

  #stub?: Uint8Array;

  async init() {
    this.#stub = await fetch(stubUrl).then((res) => res.bytes());
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {
    const stub = this.#stub;
    if (!this.ready || !stub) throw new InitializationError("Handler not initialized.");

    return inputFiles.map((file) => {
      // [stub][script][u32le script size][magic]
      const out = new Uint8Array(stub.length + file.bytes.length + 4 + MAGIC.length);
      out.set(stub);
      out.set(file.bytes, stub.length);
      new DataView(out.buffer).setUint32(stub.length + file.bytes.length, file.bytes.length, true);
      out.set(MAGIC, out.length - MAGIC.length);
      return { name: changeExt(file.name, outputFormat.extension), bytes: out };
    });
  }
}

export default batToExeHandler;
