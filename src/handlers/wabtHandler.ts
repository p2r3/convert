import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import { Category } from "../CommonFormats.ts";
import wabt from "wabt";

// WabtModule is not exported
type WabtModule = Awaited<ReturnType<typeof wabt>>;

export default class wabtHandler implements FormatHandler {
  public name: string = "wabt";
  public supportedFormats?: FileFormat[];
  public ready: boolean = false;

  private wabtModule?: WabtModule;

  wasm2wat(bytes: Uint8Array): Uint8Array {
    const wasmModule = this.wabtModule!.readWasm(bytes, {});
    const str = wasmModule.toText({});
    const encoder = new TextEncoder();
    const encoded = encoder.encode(str);
    wasmModule.destroy();
    return encoded;
  }

  wat2wasm(filename: string, bytes: Uint8Array): Uint8Array {
    const wasmModule = this.wabtModule!.parseWat(filename, bytes);
    const outBytes = wasmModule.toBinary({});
    const buffer = outBytes.buffer;
    wasmModule.destroy();
    return buffer;
  }

  async init() {
    this.supportedFormats = [
      {
        name: "WebAssembly Binary (Wasm)",
        format: "wasm",
        extension: "wasm",
        mime: "application/wasm",
        from: true,
        to: true,
        internal: "wasm",
        category: Category.CODE,
        lossless: true,
      },
      {
        name: "WebAssembly Text Format (WAT)",
        format: "wat",
        extension: "wat",
        // https://github.com/WebAssembly/spec/issues/1347
        mime: "text/plain",
        from: true,
        to: true,
        internal: "wat",
        category: Category.CODE,
        lossless: true,
      },
    ];

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
          name:
            file.name.split(".").slice(0, -1).join(".") +
            `.${outputFormat.extension}`,
          bytes: this.wasm2wat(file.bytes),
        });
      }
      return outputFiles;
    }

    if (inputFormat.internal == "wat" && outputFormat.internal == "wasm") {
      for (const file of inputFiles) {
        outputFiles.push({
          name:
            file.name.split(".").slice(0, -1).join(".") +
            `.${outputFormat.extension}`,
          bytes: this.wat2wasm(file.name, file.bytes),
        });
      }
      return outputFiles;
    }

    throw new Error(
      `wabtHandler does not support route: ${inputFormat.internal} -> ${outputFormat.internal}`,
    );
  }
}
