import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import Formats from "src/Formats.ts";
import type { ConvertContext } from "src/ui/ProgressStore.ts";
import { optimise } from "@jsquash/oxipng";

class oxipngHandler implements FormatHandler {
  public readonly name = "oxipng";
  // a single format means no edges in the conversion graph, so this only runs for PNG to PNG
  // (see `compressorsFor`)
  public supportedFormats = [Formats.PNG.builder("png").lossless().fromTo()];
  public ready = false;

  async init() {
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    _inputFormat: FileFormat,
    _outputFormat: FileFormat,
    _args?: string[],
    ctx?: ConvertContext,
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];
    for (const [i, file] of inputFiles.entries()) {
      ctx?.throwIfAborted();
      ctx?.progress(`Optimising ${file.name}...`, i / inputFiles.length);
      // the codec's default level: the pixels stay the same, only the encoding gets smaller
      const bytes = await optimise(new Uint8Array(file.bytes).buffer);
      outputFiles.push({ name: file.name, bytes: new Uint8Array(bytes) });
    }
    return outputFiles;
  }
}

export default oxipngHandler;
