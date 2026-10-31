import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import { Replay } from "./bsor/replay.ts";
import { render } from "./bsor/renderer.ts";
import Formats from "src/Formats.ts";
import { changeExt, encode } from "src/common/index.ts";

class bsorHandler implements FormatHandler {
  public readonly name = "bsor";
  public supportedFormats = [
    Formats.BSOR.builder("bsor").from(),
    Formats.PNG.builder("png").to(),
    Formats.JPEG.builder("jpeg").to(),
    Formats.JSON.builder("json").lossless().to(),
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
    let frameIndex = 0;
    return (
      await Promise.all(
        inputFiles.map(async (file) => {
          const replay = new Replay(file.bytes);
          if (outputFormat.internal === "json") {
            return [
              {
                name: changeExt(file.name, "json"),
                bytes: encode(JSON.stringify(replay)),
              },
            ];
          }
          let outputs: FileData[] = [];
          await new Promise<void>((resolve) => {
            render(
              replay,
              640,
              480,
              async (canvas) => {
                const blob = await canvas.convertToBlob({
                  type: outputFormat.mime,
                });
                const bytes = await blob.bytes();
                outputs.push({
                  name: file.name.split(".")[0] + "_" + frameIndex++ + "." + outputFormat.extension,
                  bytes: bytes,
                });
              },
              async () => resolve(),
            );
          });
          return outputs;
        }),
      )
    ).flat();
  }
}

export default bsorHandler;
