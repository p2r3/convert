// file: shToElf.ts

import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats, { Category } from "src/CommonFormats.ts";

import elfUrl from "./shToElf/stub.elf?url";

function replaceUint32LE(file: Buffer, from: number, to: number) {
  const fromBytes = Buffer.alloc(4);
  fromBytes.writeUint32LE(from, 0);

  const toBytes = Buffer.alloc(4);
  toBytes.writeUint32LE(to, 0);

  const index = file.indexOf(fromBytes);
  toBytes.copy(file, index);
}

class shToElfHandler implements FormatHandler {

  public name: string = "shToElf";
  public supportedFormats: FileFormat[] = [
    CommonFormats.SH.builder("sh").allowFrom().markLossless(),
    {
      name: "x86-64 Linux Executable and Linkable Format",
      format: "elf",
      extension: "elf",
      mime: "application/x-elf",
      from: false,
      to: true,
      internal: "elf",
      category: Category.CODE,
    }
  ];
  public ready: boolean = false;

  #binary?: Buffer;

  async init () {
    this.ready = true;
    this.#binary = Buffer.from(await (await fetch(elfUrl)).bytes());
  }

  async doConvert (
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];

    for (const inputFile of inputFiles) {
      const binary = Buffer.from(new Uint8Array(this.#binary!));
      replaceUint32LE(binary, 1273991571, inputFile.bytes.length);

      let file = Buffer.concat([
        binary,
        inputFile.bytes
      ]);

      outputFiles.push({ 
        name: inputFile.name.replace(/\.[^.]+$/, "") + ".elf",
        bytes: file
      });
    }

    return outputFiles;
  }

}

export default shToElfHandler;