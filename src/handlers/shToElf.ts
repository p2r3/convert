import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import Formats from "src/Formats.ts";
import { InitializationError } from "src/errors.ts";

import elfUrl from "built/shtoelf/stub.elf?url";
import { changeExt } from "src/common/index.ts";

const MAGIC = new TextEncoder().encode("CONVERT\0");

class shToElfHandler implements FormatHandler {
  public readonly name = "shToElf";
  public supportedFormats = [
    Formats.SH.builder("sh").lossless().from(),
    Formats.ELF.builder("elf").to(),
  ];
  public ready = false;

  #stub?: Uint8Array;

  async init() {
    this.#stub = await fetch(elfUrl).then((res) => res.bytes());
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
      return { name: changeExt(file.name, "elf"), bytes: out };
    });
  }
}

export default shToElfHandler;
