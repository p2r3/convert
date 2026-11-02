import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import { FormatDefinition } from "../FormatHandler.ts";
import type { ConvertContext } from "../ui/ProgressStore.js";
import Formats, { AUDIO_FILES, Category } from "src/Formats.ts";
import { changeExt } from "src/common/index.ts";
import { ffmpegScaleFilter } from "src/ConversionSettings.ts";
import { FFmpeg, type LogEvent } from "@ffmpeg/ffmpeg";
import ffmpegCoreUrl from "@ffmpeg/core?url";
import ffmpegWasmUrl from "@ffmpeg/core/wasm?url";

// their own formats, so that picking one is a request for the tool rather than a plain PNG or MP4
const CONTACT_SHEET = new FormatDefinition(
  "Contact sheet (16 stills from a video)",
  "contact-sheet",
  "png",
  "image/png",
  Category.IMAGE,
);
const AUDIO_VIDEO = new FormatDefinition(
  "Video of audio (cover art or waveform)",
  "audio-video",
  "mp4",
  "video/mp4",
  Category.VIDEO,
);

export const VIDEO_FILES = [
  Formats.MP4.builder("mp4"),
  Formats.MOV.builder("mov"),
  Formats.MKV.builder("matroska"),
  Formats.WEBM.builder("webm"),
  Formats.AVI.builder("avi"),
].map((format) => format.from());

/**
 * One single-threaded FFmpeg for these tools and the metadata report, apart from the FFmpeg
 * handler's own: they run plain commands on one file and need none of its concat input, retries
 * or thread handling.
 */
let loading: Promise<FFmpeg> | undefined;
export function loadFFmpeg() {
  loading ??= (async () => {
    const ffmpeg = new FFmpeg();
    await ffmpeg.load({ coreURL: ffmpegCoreUrl, wasmURL: ffmpegWasmUrl });
    return ffmpeg;
  })();
  loading.catch(() => (loading = undefined));
  return loading;
}

/** Arguments without spaces in them, written as one line. */
const args = (line: string) => line.split(" ");

/** Runs FFmpeg and returns its exit code with everything it logged. */
export async function run(ffmpeg: FFmpeg, args: string[], ctx?: ConvertContext) {
  let log = "";
  const collect = ({ message }: LogEvent) => {
    log += message + "\n";
    ctx?.log(message);
  };
  ffmpeg.on("log", collect);
  const code = await ffmpeg.exec(["-hide_banner", ...args]);
  ffmpeg.off("log", collect);
  return { code, log };
}

export async function readOutput(ffmpeg: FFmpeg, name: string) {
  const bytes = new Uint8Array((await ffmpeg.readFile(name)) as Uint8Array);
  await ffmpeg.deleteFile(name);
  return bytes;
}

/** Lays 16 evenly spaced stills of a video out in a 4 × 4 grid. */
export class contactSheetHandler implements FormatHandler {
  public readonly name = "contactSheet";
  public supportedFormats = [...VIDEO_FILES, CONTACT_SHEET.builder("png").lossless().to()];
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
    const ffmpeg = await loadFFmpeg();
    const outputFiles: FileData[] = [];
    for (const [i, file] of inputFiles.entries()) {
      ctx?.throwIfAborted();
      ctx?.progress(`Picking stills from ${file.name}...`, i / inputFiles.length);
      await ffmpeg.writeFile("input", new Uint8Array(file.bytes));
      // without an output FFmpeg only describes the input, and exits with an error
      const { log } = await run(ffmpeg, ["-i", "input"]);
      const [, h, m, s] = /Duration: (\d+):(\d+):([\d.]+)/.exec(log) ?? [];
      const duration = Number(h) * 3600 + Number(m) * 60 + Number(s);
      const rate = duration > 0 ? 16 / duration : 1;
      const filter = `fps=${rate},scale=320:-2,tile=4x4:padding=4:margin=4`;
      const { code } = await run(
        ffmpeg,
        ["-i", "input", "-vf", filter, "-frames:v", "1", "output.png"],
        ctx,
      );
      await ffmpeg.deleteFile("input");
      if (code !== 0) throw new Error(`FFmpeg could not read the video in ${file.name}.`);
      outputFiles.push({
        name: changeExt(file.name, "png", "-contact-sheet"),
        bytes: await readOutput(ffmpeg, "output.png"),
      });
    }
    return outputFiles;
  }
}

/** Turns audio into an MP4 that shows its cover art, or a waveform if it has none. */
export class audioVideoHandler implements FormatHandler {
  public readonly name = "audioVideo";
  public supportedFormats = [...AUDIO_FILES, AUDIO_VIDEO.builder("mp4").to()];
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
    const ffmpeg = await loadFFmpeg();
    const audio = args("-c:a aac -b:a 192k -pix_fmt yuv420p -c:v libx264");
    const outputFiles: FileData[] = [];
    for (const [i, file] of inputFiles.entries()) {
      ctx?.throwIfAborted();
      ctx?.progress(`Making a video of ${file.name}...`, i / inputFiles.length);
      await ffmpeg.writeFile("input", new Uint8Array(file.bytes));

      // cover art is a video stream of one frame, so it is taken out and looped
      const cover = await run(ffmpeg, ["-i", "input", "-an", "-frames:v", "1", "cover.png"]);
      const { code } = await run(
        ffmpeg,
        cover.code === 0
          ? [
              ...args("-loop 1 -framerate 1 -i cover.png -i input -map 0:v -map 1:a"),
              "-vf",
              ffmpegScaleFilter({ maxSize: 1280 })!,
              ...args("-tune stillimage"),
              ...audio,
              ...args("-shortest output.mp4"),
            ]
          : [
              ...args("-i input -filter_complex"),
              "[0:a]showwaves=s=640x360:mode=cline:rate=15:colors=white,format=yuv420p[v]",
              ...args("-map [v] -map 0:a -preset ultrafast"),
              ...audio,
              "output.mp4",
            ],
        ctx,
      );
      await ffmpeg.deleteFile("input");
      if (cover.code === 0) await ffmpeg.deleteFile("cover.png");
      if (code !== 0) throw new Error(`FFmpeg could not make a video of ${file.name}.`);
      outputFiles.push({
        name: changeExt(file.name, "mp4"),
        bytes: await readOutput(ffmpeg, "output.mp4"),
      });
    }
    return outputFiles;
  }
}
