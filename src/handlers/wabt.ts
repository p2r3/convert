import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import Formats from "../Formats.ts";
import wabt from "wabt";
import { changeExt, encode, ownedBytes } from "src/common/index.ts";

// WabtModule is not exported
type WabtModule = Awaited<ReturnType<typeof wabt>>;

export default class wabtHandler implements FormatHandler {
  public readonly name = "wabt";
  public supportedFormats = [
    Formats.WASM.builder("wasm").lossless().fromTo(),
    Formats.WAT.builder("wat").lossless().fromTo(),
  ];
  public ready = false;

  private wabtModule?: WabtModule;

  wasm2wat(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
    const wasmModule = this.wabtModule!.readWasm(bytes, {});
    const str = wasmModule.toText({});
    const encoded = encode(str);
    wasmModule.destroy();
    return encoded;
  }

  wat2wasm(filename: string, bytes: Uint8Array): Uint8Array<ArrayBuffer> {
    const wasmModule = this.wabtModule!.parseWat(filename, bytes);
    const outBytes = wasmModule.toBinary({});
    const buffer = ownedBytes(outBytes.buffer);
    wasmModule.destroy();
    return buffer;
  }

  async init() {
    this.wabtModule = await wabt();

    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];

    if (inputFormat.internal == "wasm" && outputFormat.internal == "wat") {
      for (const file of inputFiles) {
        outputFiles.push({
          name: changeExt(file.name, outputFormat.extension),
          bytes: this.wasm2wat(file.bytes),
        });
      }
      return outputFiles;
    }

    if (inputFormat.internal == "wat" && outputFormat.internal == "wasm") {
      for (const file of inputFiles) {
        outputFiles.push({
          name: changeExt(file.name, outputFormat.extension),
          bytes: this.wat2wasm(file.name, file.bytes),
        });
      }
      return outputFiles;
    }

    throw new TypeError(
      `wabtHandler does not support route: ${inputFormat.internal} -> ${outputFormat.internal}`,
    );
  }
}
