// file: clang-wasi.ts

import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats, { Category } from "src/CommonFormats.ts";
import { commands } from '@yowasp/clang';

class clangWasiHandler implements FormatHandler {

  public name: string = "clang-wasi";
  public supportedFormats: FileFormat[] = [
    {
      name: "C Source File",
      format: "c",
      extension: "c",
      mime: "text/x-c",
      from: true,
      to: false,
      internal: "c",
      category: Category.CODE,
      lossless: false,
    },
    {
      name: "C++ Source File",
      format: "cpp",
      extension: "cpp",
      mime: "text/x-c++src",
      from: true,
      to: false,
      internal: "cpp",
      category: Category.CODE,
      lossless: false,
    },
    {
      name: "Assembly Source File",
      format: "asm",
      extension: "s",
      mime: "text/x-asm",
      from: true,
      to: false,
      internal: "asm",
      category: Category.CODE,
      lossless: false,
    },
    {
      name: "WebAssembly Binary (Wasm)",
      format: "wasm",
      extension: "wasm",
      mime: "application/wasm",
      from: false,
      to: true,
      internal: "wasm",
      category: Category.CODE,
      lossless: true,
    },
  ];
  public ready: boolean = false;

  async init () {
    this.ready = true;
  }

  async doConvert (
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];
    for (const inputFile of inputFiles) {
      const output = await commands
      [inputFormat.internal === "cpp" ? "clang++" : "clang"]
      (
        [inputFile.name, "-o", "out.wasm", "-O3", "-fno-exceptions"], 
        // this build specifically excludes exceptions for some reason
        {
          [inputFile.name]: inputFile.bytes
        }
      );
      if (!output) throw new Error("clang did not return any files?");

      const data = output["out.wasm"];
      let bytes;
      if (data instanceof Uint8Array) { // js wtf is this ??
        bytes = data;
      } else if (typeof data === "string") {
        bytes = new TextEncoder().encode(data);
      } else {
        throw new Error("clang output was not a file");
      }

      outputFiles.push({
        name: inputFile.name.replace(/\.[^.]+$/, "") + `.wasm`,
        bytes,
      });
    }
    return outputFiles;
  }

}

export default clangWasiHandler;
