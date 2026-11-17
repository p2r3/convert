import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import { Replay } from "./bsor/replay.ts";
import { render } from "./bsor/renderer.ts";
import Formats from "src/Formats.ts";
import { resolveSize } from "src/common/canvas.ts";
import type { ConvertContext } from "src/ui/ProgressStore.ts";

class bsorHandler implements FormatHandler {
  public readonly name = "bsor";
  public supportedFormats = [
    Formats.BSOR.builder("bsor").from(),
    Formats.PNG.builder("png").options({ width: true, height: true }).to(),
    Formats.JPEG.builder("jpeg").options({ width: true, height: true }).to(),
  ];
  public ready = false;

  async init() {
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
    ctx?: ConvertContext,
  ): Promise<FileData[]> {
    const { width, height } = resolveSize(640, 480, ctx?.options);
    let frameIndex = 0;
    return (
      await Promise.all(
        inputFiles.map(async (file) => {
          const replay = new Replay(file.bytes);
          let outputs: FileData[] = [];
          await new Promise<void>((resolve) => {
            render(
              replay,
              width,
              height,
              async (canvas) => {
                const blob = await canvas.convertToBlob({ type: outputFormat.mime });
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
