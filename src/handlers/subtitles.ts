import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import type { ConvertContext } from "../ui/ProgressStore.js";
import Formats from "src/Formats.ts";
import { changeExt } from "src/common/index.ts";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import ffmpegCoreUrl from "@ffmpeg/core?url";
import ffmpegWasmUrl from "@ffmpeg/core/wasm?url";

/**
 * Converts subtitle files with FFmpeg.
 * The FFmpeg handler leaves subtitle formats out on purpose: next to its video and audio
 * formats they would open routes like "video to SRT" in the conversion graph, which FFmpeg
 * cannot follow. Here they only connect to each other.
 */
class subtitlesHandler implements FormatHandler {
  public readonly name = "subtitles";
  public supportedFormats = [
    Formats.SRT.builder("srt").fromTo(),
    Formats.VTT.builder("webvtt").fromTo(),
    Formats.ASS.builder("ass").fromTo(),
  ];
  public ready = false;

  #ffmpeg?: FFmpeg;

  async init() {
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
    _args?: string[],
    ctx?: ConvertContext,
  ): Promise<FileData[]> {
    if (!this.#ffmpeg) {
      this.#ffmpeg = new FFmpeg();
      await this.#ffmpeg.load({ coreURL: ffmpegCoreUrl, wasmURL: ffmpegWasmUrl });
    }
    const ffmpeg = this.#ffmpeg;

    const outputFiles: FileData[] = [];
    for (const file of inputFiles) {
      ctx?.throwIfAborted();
      await ffmpeg.writeFile("input", new Uint8Array(file.bytes));
      const code = await ffmpeg.exec([
        "-hide_banner",
        "-f",
        inputFormat.internal,
        "-i",
        "input",
        "-f",
        outputFormat.internal,
        "output",
      ]);
      await ffmpeg.deleteFile("input");
      if (code !== 0) throw new Error(`${file.name} could not be read as ${inputFormat.name}.`);
      const bytes = (await ffmpeg.readFile("output")) as Uint8Array;
      await ffmpeg.deleteFile("output");
      outputFiles.push({
        name: changeExt(file.name, outputFormat.extension),
        bytes: new Uint8Array(bytes),
      });
    }
    return outputFiles;
  }
}

export default subtitlesHandler;
