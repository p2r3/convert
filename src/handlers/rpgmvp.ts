import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats, { Category } from "src/CommonFormats.ts";
import { Decrypter } from "./rpgmvp-decrypter/scripts/Decrypter.js";

class rpgmvpHandler implements FormatHandler {
  public name: string = "rpgmvp";
  public supportedFormats?: FileFormat[];
  public ready: boolean = false;
  public offload: boolean = true;

  async init() {
    this.supportedFormats = [
      {
        name: "RPG Maker MV PNG (RPGMVP)",
        format: "rpgmvp",
        extension: "rpgmvp",
        mime: "application/x-rpgmvp",
        from: true,
        to: false,
        internal: "rpgmvp",
        category: Category.IMAGE,
        lossless: true,
      },
      CommonFormats.PNG.builder("png").markLossless().allowFrom(false).allowTo(true),
    ];
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];

    if (inputFormat.internal !== "rpgmvp" || outputFormat.internal !== "png") {
      throw new TypeError(
        `Unsupported conversion path: ${inputFormat.internal} -> ${outputFormat.internal}`,
      );
    }

    for (const inputFile of inputFiles) {
      const as_buffer = inputFile.bytes.buffer as ArrayBuffer;

      const encryption_key = Decrypter.getKeyFromPNG(16, as_buffer);
      const decrypter = new Decrypter(encryption_key) as Decrypter & {
        verifyFakeHeader(header: Uint8Array): boolean;
        decrypt(buffer: ArrayBuffer): ArrayBuffer;
      };
      if (!decrypter.verifyFakeHeader(new Uint8Array(as_buffer, 0, 16))) {
        throw new Error(`Invalid RPGMVP header: ${inputFile.name}`);
      }

      const bytes = new Uint8Array(decrypter.decrypt(as_buffer));
      const name = inputFile.name.split(".").slice(0, -1).join(".") + "." + outputFormat.extension;

      outputFiles.push({ bytes, name });
    }

    return outputFiles;
  }
}

export default rpgmvpHandler;
