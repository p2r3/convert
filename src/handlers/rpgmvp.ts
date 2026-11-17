import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import Formats from "src/Formats.ts";
import { Decrypter } from "built/rpgmvp-decrypter/scripts/Decrypter.js";
import { changeExt } from "src/common/index.ts";

class rpgmvpHandler implements FormatHandler {
  public readonly name = "rpgmvp";
  public supportedFormats = [
    Formats.RPGMVP.builder("rpgmvp").lossless().from(),
    Formats.PNG.builder("png").lossless().to(),
  ];
  public ready = false;

  async init() {
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
      const as_buffer = inputFile.bytes.buffer;

      const encryption_key = Decrypter.getKeyFromPNG(16, as_buffer);
      const decrypter = new Decrypter(encryption_key);
      if (!decrypter.verifyFakeHeader(new Uint8Array(as_buffer, 0, 16))) {
        throw new Error(`Invalid RPGMVP header: ${inputFile.name}`);
      }

      const bytes = new Uint8Array(decrypter.decrypt(as_buffer));
      const name = changeExt(inputFile.name, outputFormat.extension);

      outputFiles.push({ bytes, name });
    }

    return outputFiles;
  }
}

export default rpgmvpHandler;
