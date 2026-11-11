import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import type { ConvertContext } from "../ui/ProgressStore.js";

import FFmpeg, { type MainModule as FFmpegModule } from "built/ffmpeg/ffmpeg-core";
import wasmUrl from "built/ffmpeg/ffmpeg-core.wasm.gz?url";

import mime from "mime";
import normalizeMimeType from "../normalizeMimeType.ts";
import Formats, { Category, type CategoryType } from "src/Formats.ts";
import { changeExt, encode } from "src/common/index.ts";
import { fetchGzip } from "src/common/gzip.ts";
import type { FormatOptions } from "src/Settings.ts";

/**
 * Codecs offered as options, per muxer. FFmpeg can't tell which codecs a container accepts,
 * so this only covers the common ones. Names are FFmpeg codec names, which `-c` resolves to
 * the default encoder.
 */
const CONTAINER_CODECS: Record<string, { video?: string[]; audio?: string[] }> = {
  mp4: { video: ["h264", "hevc", "av1", "vp9", "mpeg4"], audio: ["aac", "mp3", "opus"] },
  mov: { video: ["h264", "hevc", "mpeg4"], audio: ["aac", "mp3"] },
  matroska: {
    video: ["h264", "hevc", "av1", "vp9", "vp8", "mpeg4"],
    audio: ["aac", "mp3", "opus", "vorbis", "flac"],
  },
  webm: { video: ["vp9", "vp8", "av1"], audio: ["opus", "vorbis"] },
  ogg: { video: ["theora"], audio: ["vorbis", "opus", "flac"] },
};

type FFmpegOptions = {
  preRun?: (ffmpeg: FFmpegModule) => void;
  postRun?: (ffmpeg: FFmpegModule) => void;
  log?: (str: string, type: "stderr" | "stdout") => void;
  abort?: AbortSignal;
};

function durationToSeconds(duration: string): number {
  return duration.split(":").reduce((total, part) => total * 60 + Number(part), 0);
}

class FFmpegHandler implements FormatHandler {
  static formatNames: Map<string, string> = new Map([
    ["mp4", Formats.MP4.name],
    ["m4a", "MPEG-4 Audio"],
    ["flac", Formats.FLAC.name],
    ["wav", Formats.WAV.name],
    ["mp3", Formats.MP3.name],
    ["ogg", Formats.OGG.name],
    ["matroska", "Matroska / WebM"],
    ["mov", "QuickTime / MOV"],
    ["3gp", "3GPP Multimedia Container"],
    ["3g2", "3GPP2 Multimedia Container"],
    ["asf", "Windows Media Video (WMV)"],
  ]);

  public readonly name = "FFmpeg";
  public supportedFormats: FileFormat[] = [];
  public ready = false;
  public abortable = true;

  #module?: Promise<WebAssembly.Module>;

  /** Options honoured when writing `format`. `encodable` holds the codecs this build can encode. */
  static optionsFor(format: FileFormat, encodable: Set<string>): FormatOptions | undefined {
    // these are written with a -target preset that fixes everything
    if (format.internal === "dvd" || format.internal === "vcd") return undefined;

    const categories = Array.isArray(format.category) ? format.category : [format.category];
    const options: FormatOptions = {};
    if (categories.includes(Category.VIDEO))
      Object.assign(options, { width: true, height: true, fps: true, videoBitrate: true });
    else if (categories.includes(Category.IMAGE))
      Object.assign(options, { width: true, height: true });
    if (categories.includes(Category.VIDEO) || categories.includes(Category.AUDIO))
      Object.assign(options, { sampleRate: true, channels: true, audioBitrate: true });

    // formats like ogg-vorbis already stand for one codec
    const codecs =
      format.format === format.internal ? CONTAINER_CODECS[format.internal] : undefined;
    const video = codecs?.video?.filter((codec) => encodable.has(codec));
    const audio = codecs?.audio?.filter((codec) => encodable.has(codec));
    if (video?.length && categories.includes(Category.VIDEO))
      options.videoCodec = { type: "enum", values: video };
    if (audio?.length) options.audioCodec = { type: "enum", values: audio };

    return Object.keys(options).length ? options : undefined;
  }

  async execFFmpeg(args: string[], opts?: FFmpegOptions): Promise<string> {
    // cache it smartly
    if (!this.#module) {
      this.#module = WebAssembly.compileStreaming(fetchGzip(wasmUrl, "application/wasm"));
      this.#module.catch(() => (this.#module = undefined));
    }

    const { promise, resolve, reject } = Promise.withResolvers<string>();
    const mod = await this.#module;
    let abort: () => void;
    let stdout = "";

    // for errors that happen before we init
    const { promise: killer, reject: killIt } = Promise.withResolvers<never>();

    const fail = (reason: string) => {
      try {
        opts?.abort?.removeEventListener("abort", abort);
      } catch {}
      reject(new Error(reason));
      killIt(new Error(reason));
    };

    const ffmpeg = (await Promise.race([
      killer,
      FFmpeg({
        instantiateWasm(
          imports: WebAssembly.Imports,
          ok: (inst: WebAssembly.Instance, mod: WebAssembly.Module) => void,
        ) {
          WebAssembly.instantiate(mod, imports).then(
            (inst) => ok(inst, mod),
            (e) => killIt(e),
          );
          return {};
        },
        print(str: string) {
          stdout += str + "\n";
          opts?.log?.(str, "stdout");
        },
        printErr(str: string) {
          stdout += str + "\n";
          opts?.log?.(str, "stderr");
          if (str.startsWith("worker sent an error!")) fail(str);
        },
        stdin() {
          return null;
        },
        onExit() {
          resolve(
            (async () => {
              opts?.postRun?.(ffmpeg);
              opts?.abort?.removeEventListener("abort", abort);
              return stdout;
            })(),
          );
        },
        onAbort(reason: string) {
          fail(reason);
        },
      }),
    ])) as FFmpegModule & { _emscripten_force_exit(status: number): void }; // the .d.ts is wrong

    abort = () => {
      try {
        ffmpeg._emscripten_force_exit(255);
      } catch {}
    };
    opts?.preRun?.(ffmpeg);
    opts?.abort?.addEventListener("abort", abort);
    ffmpeg.callMain(args);
    return promise;
  }

  async init() {
    if (!globalThis.crossOriginIsolated) throw new Error("can't run without multithreading!");

    const formatLines = (await this.execFFmpeg(["-formats", "-hide_banner"]))
      .split(" ---\n")[1]
      .split("\n");

    const muxers = new Map(
      (await this.execFFmpeg(["-h", "allmuxers", "-hide_banner"]))
        .split(/^Muxer /m)
        .flatMap((muxer) => {
          try {
            return [
              [
                muxer.split(" ")[0],
                {
                  extension: muxer.split("Common extensions: ")[1].split(".")[0].split(",")[0],
                  mimeType: muxer
                    .split("Mime type: ")[1]
                    .split("\n")[0]
                    .split(".")
                    .slice(0, -1)
                    .join("."),
                },
              ],
            ];
          } catch {
            return [];
          }
        }),
    );

    this.supportedFormats = [];
    for (let line of formatLines) {
      const flags = line.slice(0, 4);
      line = line.slice(4);
      let len;
      do {
        len = line.length;
        line = line.replaceAll("  ", " ");
      } while (len !== line.length);
      line = line.trim();

      const parts = line.split(" ");
      if (!parts[0]) continue;

      const description = parts.slice(1).join(" ");
      const formats = parts[0].split(",");

      if (description.startsWith("piped ")) continue;
      if (description.toLowerCase().includes("subtitle")) continue;
      if (description.toLowerCase().includes("manifest")) continue;

      for (const format of formats) {
        let primaryFormat = formats[0];
        if (primaryFormat === "png") primaryFormat = "apng";

        let extension, mimeType;
        const details = (format !== formats[0] && muxers.get(format)) || muxers.get(primaryFormat);
        if (details) {
          extension = details.extension;
          mimeType = details.mimeType;
        } else {
          extension = format;
          mimeType = mime.getType(format) || "video/" + format;
        }
        mimeType = normalizeMimeType(mimeType);

        const mimeCategory = mimeType.split("/")[0];
        let category: CategoryType;
        if (
          description.includes("PCM") ||
          description.includes("PWM") ||
          primaryFormat === "aptx" ||
          primaryFormat === "aptx_hd" ||
          primaryFormat === "codec2" ||
          primaryFormat === "codec2raw" ||
          primaryFormat === "apm" ||
          primaryFormat === "alp"
        ) {
          category = Category.AUDIO;
          mimeType = "audio/" + mimeType.split("/")[1];
        } else if (
          mimeCategory === Category.AUDIO ||
          mimeCategory === Category.VIDEO ||
          mimeCategory === Category.IMAGE
        ) {
          category = mimeCategory;
        } else if (description.toLowerCase().includes("audio")) {
          category = Category.AUDIO;
        } else {
          category = Category.VIDEO;
        }

        const name =
          FFmpegHandler.formatNames.get(format) ||
          description + (formats.length > 1 ? " / " + format : "");

        this.supportedFormats.push({
          name: name,
          format,
          extension,
          mime: mimeType,
          from: flags.includes("D"),
          to: flags.includes("E"),
          internal: format,
          category,
          lossless: ["png", "bmp", "tiff"].includes(format),
        });
      }
    }

    // ====== Manual fine-tuning ======

    const prioritize = ["webm", "mp4", "gif", "wav"];
    prioritize.reverse();

    this.supportedFormats.sort((a, b) => {
      const priorityIndexA = prioritize.indexOf(a.format);
      const priorityIndexB = prioritize.indexOf(b.format);
      return priorityIndexB - priorityIndexA;
    });

    const remove = [
      // RTSP stalls when attempted
      "rtsp",
    ];
    this.supportedFormats = this.supportedFormats.filter((c) => !remove.includes(c.internal));

    for (const format of this.supportedFormats) {
      if (format.format === "adts") format.format = "aac";
    }

    // Add .qta (QuickTime Audio) support - uses same mov demuxer
    this.supportedFormats.push(Formats.QTA.builder("mov").fromTo());

    // Add .wmv (Windows Media Video) support - uses ASF container
    this.supportedFormats.push(Formats.WMV.builder("asf").fromTo());

    // Add .mts (AVCHD) support — camcorder footage using the MPEG-TS container.
    // FFmpeg auto-discovers "mpegts" but assigns the ".ts" extension, leaving
    // ".mts" files (JVC, Sony, Panasonic AVCHD camcorders) unrecognised.
    this.supportedFormats.push(Formats.MTS.builder("mpegts").from());

    // Add .m2ts (Blu-ray BDMV) support — same MPEG-TS container, different extension.
    this.supportedFormats.push(Formats.M2TS.builder("mpegts").from());

    // Normalize Bink metadata to ensure ".bik" files are detected by extension.
    const binkFormats = this.supportedFormats.filter(
      (f) => f.internal === "bink" || f.format === "bink" || f.extension === "bik",
    );
    if (binkFormats.length > 0) {
      for (const binkFormat of binkFormats) {
        binkFormat.name = "Bink Video";
        binkFormat.format = "bik";
        binkFormat.extension = "bik";
        binkFormat.mime = "video/x-bink";
        binkFormat.from = true;
        binkFormat.to = false;
        binkFormat.internal = "bink";
        binkFormat.category = "video";
      }
    }

    // Add PNG input explicitly - FFmpeg otherwise treats both PNG and
    // APNG as the same thing.
    this.supportedFormats.push(Formats.PNG.builder("png").from());
    // the other way for webp
    this.supportedFormats.push(Formats.WEBP.builder("webp_anim").from());

    // Encoding-specific formats
    // todo: this should be an option, when we get them
    this.supportedFormats.push(Formats.OGG_VORBIS.builder("ogg").to());

    this.supportedFormats.push(Formats.OGG_OPUS.builder("ogg").to());

    // " DEV.LS h264   H.264 / AVC ..." - the second flag is set if the codec can be encoded
    const encodable = new Set(
      (await this.execFFmpeg(["-codecs", "-hide_banner"]))
        .split("\n")
        .flatMap((line) => line.match(/^\s*[D.]E[VA]\S*\s+(\S+)/)?.[1] ?? []),
    );
    for (const format of this.supportedFormats) {
      if (format.to) format.options = FFmpegHandler.optionsFor(format, encodable);
    }

    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
    ctx?: ConvertContext,
  ): Promise<FileData[]> {
    return this.doConvertWithArgs(inputFiles, inputFormat, outputFormat, undefined, ctx);
  }

  async doConvertWithArgs(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
    args?: string[],
    ctx?: ConvertContext,
  ): Promise<FileData[]> {
    ctx?.throwIfAborted();

    const threads = String(Math.min(8, navigator.hardwareConcurrency));

    let forceFPS = 0;
    if (inputFormat.mime === "image/png" || inputFormat.mime === "image/jpeg") {
      forceFPS = inputFiles.length < 30 ? 1 : 30;
    }

    const direct = inputFiles.length === 1 && !forceFPS;

    const options = ctx?.options ?? {};
    // -2 keeps the aspect ratio and rounds to an even size, which most encoders need
    const filters =
      options.width || options.height
        ? [`scale=${options.width ?? -2}:${options.height ?? -2}`]
        : [];
    /** A later -vf replaces earlier ones, so every filter chain has to include the user's. */
    const vf = (...extra: string[]) => ["-vf", [...filters, ...extra].join(",")];

    const command = [
      "-hide_banner",
      "-nostdin",
      "-nostats",
      "-progress",
      "pipe:1",
      "-stats_period",
      "0.5",
      "-filter_threads",
      threads,
      ...(direct ? [] : ["-f", "concat", "-safe", "0"]),
      "-threads",
      threads,
      "-i",
      direct ? `file_0.${inputFormat.extension}` : "list.txt",
      "-f",
      outputFormat.internal,
    ];
    if (outputFormat.mime === "video/mp4") {
      command.push("-pix_fmt", "yuv420p");
    } else if (outputFormat.internal === "dvd") {
      command.push("-vf", "setsar=1", "-target", "ntsc-dvd", "-pix_fmt", "rgb24");
    } else if (outputFormat.internal === "vcd") {
      command.push("-vf", "scale=352:288,setsar=1", "-target", "pal-vcd", "-pix_fmt", "rgb24");
    } else if (outputFormat.internal === "asf") {
      command.push("-b:v", "15M", "-b:a", "192k");
    } else if (outputFormat.format === "ogg-vorbis") {
      command.push("-c:a", "libvorbis");
    } else if (outputFormat.format === "ogg-opus") {
      command.push("-c:a", "libopus");
    }
    if (filters.length && !command.includes("-vf")) command.push(...vf());
    if (options.fps) command.push("-r", String(options.fps));
    if (options.videoCodec) command.push("-c:v", options.videoCodec);
    if (options.audioCodec) command.push("-c:a", options.audioCodec);
    if (options.videoBitrate) command.push("-b:v", `${options.videoBitrate}k`);
    if (options.audioBitrate) command.push("-b:a", `${options.audioBitrate}k`);
    if (options.sampleRate) command.push("-ar", String(options.sampleRate));
    if (options.channels) command.push("-ac", String(options.channels));
    // auto-fix arguments go last so that they win
    if (args) command.push(...args);
    command.push("-threads", threads);
    command.push("output");

    const preRun = (ffmpeg: FFmpegModule) => {
      let fileIndex = 0;
      let listString = "";
      ctx?.log(`Preparing ${inputFiles.length} input files...`);
      for (const file of inputFiles) {
        ctx?.throwIfAborted();
        const entryName = `file_${fileIndex++}.${inputFormat.extension}`;
        ffmpeg.FS.writeFile(entryName, new Uint8Array(file.bytes));
        listString += `file '${entryName}'\n`;
        if (forceFPS) listString += `duration ${1 / forceFPS}\n`;
      }
      ffmpeg.FS.writeFile("list.txt", encode(listString));
    };

    let fileData: Uint8Array | string | undefined;

    const postRun = (ffmpeg: FFmpegModule) => {
      try {
        fileData = ffmpeg.FS.readFile("output");
      } catch {} // swallow
    };

    let duration: number | undefined;

    const log = (str: string, type: "stderr" | "stdout") => {
      if (!ctx) return;
      if (type === "stderr") {
        ctx.log(str, "debug");
        if (str.includes("Duration:")) {
          const parsed = str.split("Duration: ").at(1)?.split(",").at(0);
          if (parsed) duration = durationToSeconds(parsed);
        }
      } else if (type === "stdout") {
        if (str.includes("out_time=")) {
          const outTime = durationToSeconds(str.split("=").at(1) ?? "");
          if (!Number.isFinite(outTime)) return;
          if (duration && Number.isFinite(duration)) {
            ctx.progress("Transcoding...", outTime / duration);
          } else {
            ctx.progress(`Transcoding... (${outTime.toFixed(1)}s processed)`, (p) =>
              Math.min(0.95, p + 0.001),
            );
          }
        }
      }
    };

    const stdout = await this.execFFmpeg(command, { preRun, postRun, log, abort: ctx?.signal });

    ctx?.throwIfAborted();

    if (stdout.includes("Conversion failed!\n")) {
      ctx?.log("Conversion failed, attempting auto-fix...", "error");
      const oldArgs = args ?? [];
      if (stdout.includes(" not divisible by") && !oldArgs.includes("-vf")) {
        const division = stdout.split(" not divisible by ")[1].split(" ")[0];
        return this.doConvertWithArgs(
          inputFiles,
          inputFormat,
          outputFormat,
          [
            ...oldArgs,
            ...vf(`pad=ceil(iw/${division})*${division}:ceil(ih/${division})*${division}`),
          ],
          ctx,
        );
      }
      if (stdout.includes("width and height must be a multiple of") && !oldArgs.includes("-vf")) {
        const division = stdout
          .split("width and height must be a multiple of ")[1]
          .split(" ")[0]
          .split("")[0];
        return this.doConvertWithArgs(
          inputFiles,
          inputFormat,
          outputFormat,
          [
            ...oldArgs,
            ...vf(`pad=ceil(iw/${division})*${division}:ceil(ih/${division})*${division}`),
          ],
          ctx,
        );
      }
      if (stdout.includes("Valid sizes are") && !oldArgs.includes("-s")) {
        const newSize = stdout.split("Valid sizes are ")[1].split(".")[0].split(" ").pop();
        if (typeof newSize !== "string") throw stdout;
        return this.doConvertWithArgs(
          inputFiles,
          inputFormat,
          outputFormat,
          [...oldArgs, "-s", newSize],
          ctx,
        );
      }
      if (
        stdout.includes("does not support that sample rate, choose from (") &&
        !oldArgs.includes("-ar")
      ) {
        const acceptedBitrate = stdout
          .split("does not support that sample rate, choose from (")[1]
          .split(", ")[0];
        return this.doConvertWithArgs(
          inputFiles,
          inputFormat,
          outputFormat,
          [...oldArgs, "-ar", acceptedBitrate],
          ctx,
        );
      }
      // e.g. AMR encoders: "Only 8000Hz sample rate supported"
      const onlyRate = stdout.match(/Only (\d+)Hz sample rate supported/);
      if (onlyRate && !oldArgs.includes("-ar")) {
        return this.doConvertWithArgs(
          inputFiles,
          inputFormat,
          outputFormat,
          [...oldArgs, "-ar", onlyRate[1]],
          ctx,
        );
      }
      if (stdout.includes("Only mono supported") && !oldArgs.includes("-ac")) {
        return this.doConvertWithArgs(
          inputFiles,
          inputFormat,
          outputFormat,
          [...oldArgs, "-ac", "1"],
          ctx,
        );
      }

      throw stdout;
    }

    let bytes: Uint8Array;

    ctx?.log("Reading output file...");

    if (!fileData || (fileData instanceof Uint8Array && fileData.length === 0)) {
      ctx?.log("FFmpeg failed to produce output file", "error");
      throw "FFmpeg failed to produce output file";
    }
    if (!(fileData instanceof Uint8Array)) {
      bytes = encode(fileData);
    } else {
      bytes = new Uint8Array(fileData?.buffer);
    }

    const name = changeExt(inputFiles[0].name, outputFormat.extension);

    ctx?.progress("Conversion complete!", 1);
    ctx?.log(`Successfully converted to ${name} (${bytes.length} bytes)`);

    return [{ bytes, name }];
  }
}

export default FFmpegHandler;
