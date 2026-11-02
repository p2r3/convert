import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import type { ConvertContext } from "../ui/ProgressStore.js";

import { FFmpeg } from "@ffmpeg/ffmpeg";
import type { LogEvent } from "@ffmpeg/ffmpeg";
import ffmpegCoreUrl from "@ffmpeg/core?url";
import ffmpegWasmUrl from "@ffmpeg/core/wasm?url";

import mime from "mime";
import normalizeMimeType from "../normalizeMimeType.ts";
import Formats, { Category, type CategoryType } from "src/Formats.ts";
import { InitializationError } from "src/errors.ts";
import { changeExt, encode, stalls } from "src/common/index.ts";
import {
  type ConversionSettings,
  categoriesOf,
  ffmpegAudioFilter,
  ffmpegCopyArgs,
  ffmpegScaleFilter,
  ffmpegSettingsArgs,
  ffmpegSpeedFilter,
  ffmpegTrimArgs,
  sameFormat,
} from "src/ConversionSettings.ts";

/**
 * Output formats that are encoded with libx264 by default, which works with threads.
 * Not every encoder does: libvpx, for one, deadlocks in the multithreaded core.
 */
const THREADED_OUTPUTS = new Set(["mp4", "mov", "matroska"]);
/** How long the multithreaded core may log nothing before it counts as hung. */
const STALL_MS = 20_000;

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

  #ffmpeg?: FFmpeg;
  /** Whether the next load takes the multithreaded core. */
  #threads = false;
  /** Set when that core has hung once; it is not tried again in this session. */
  #threadsHung = false;

  #stdout: string = "";
  #boundStdoutHandler = (log: LogEvent) => {
    this.#stdout += log.message + "\n";
  };
  clearStdout() {
    this.#stdout = "";
  }
  async getStdout(callback: () => void | Promise<void>) {
    if (!this.#ffmpeg) return "";
    this.clearStdout();
    this.#ffmpeg.on("log", this.#boundStdoutHandler);
    await callback();
    this.#ffmpeg.off("log", this.#boundStdoutHandler);
    return this.#stdout;
  }

  async loadFFmpeg() {
    if (!this.#ffmpeg) return;
    if (this.#threads) {
      // Copied as they are by vite.config.js and not imported with "?url": the core starts its
      // threads from the worker script as a classic worker, which Vite would break in two ways,
      // by inlining so small a script as a "data:" URL and, in development, by adding an import.
      const threaded = new URL("external/ffmpeg-mt/", globalThis.baseUrl).href;
      return await this.#ffmpeg.load({
        coreURL: `${threaded}ffmpeg-core.js`,
        wasmURL: `${threaded}ffmpeg-core.wasm`,
        workerURL: `${threaded}ffmpeg-core.worker.js`,
      });
    }
    return await this.#ffmpeg.load({
      coreURL: ffmpegCoreUrl,
      wasmURL: ffmpegWasmUrl,
    });
  }
  terminateFFmpeg() {
    if (!this.#ffmpeg) return;
    this.#ffmpeg.terminate();
  }
  async reloadFFmpeg() {
    if (!this.#ffmpeg) return;
    this.terminateFFmpeg();
    this.#ffmpeg = new FFmpeg();
    await this.loadFFmpeg();
  }
  /**
   * FFmpeg tends to run out of memory (?) with an "index out of bounds"
   * message sometimes. Other times it just stalls, irrespective of any timeout.
   *
   * This wrapper restarts FFmpeg when it crashes with that OOB error, and
   * forces a Promise-level timeout as a fallback for when it stalls.
   * @param args CLI arguments, same as in `FFmpeg.exec()`.
   * @param timeout Max execution time in milliseconds. `-1` for no timeout (default).
   * @param attempts Amount of times to attempt execution. Default is 1.
   */
  async execSafe(args: string[], timeout: number = -1, attempts: number = 1): Promise<void> {
    if (!this.#ffmpeg) throw new InitializationError("Handler not initialized.");
    try {
      if (timeout === -1) {
        await this.#ffmpeg.exec(args);
      } else {
        await Promise.race([
          this.#ffmpeg.exec(args, timeout),
          new Promise((_, reject) => setTimeout(reject, timeout)),
        ]);
      }
    } catch (e) {
      if (!e || (typeof e === "string" && e.includes("out of bounds") && attempts > 1)) {
        await this.reloadFFmpeg();
        return await this.execSafe(args, timeout, attempts - 1);
      }
      console.error(e);
      throw e;
    }
  }

  async init(knownFormats?: FileFormat[]) {
    this.#ffmpeg = new FFmpeg();
    // discovery below runs hundreds of FFmpeg commands; doConvert loads the core itself
    if (knownFormats) {
      this.supportedFormats = knownFormats;
      this.ready = true;
      return;
    }
    await this.loadFFmpeg();

    const getMuxerDetails = async (muxer: string) => {
      const stdout = await this.getStdout(async () => {
        await this.execSafe(["-hide_banner", "-h", "muxer=" + muxer], 3000, 5);
      });

      return {
        extension: stdout.split("Common extensions: ")[1].split(".")[0].split(",")[0],
        mimeType: stdout.split("Mime type: ")[1].split("\n")[0].split(".").slice(0, -1).join("."),
      };
    };

    const stdout = await this.getStdout(async () => {
      await this.execSafe(["-formats", "-hide_banner"], 3000, 5);
    });
    const lines = stdout.split(" --\n")[1].split("\n");

    this.supportedFormats = [];
    for (let line of lines) {
      let len;
      do {
        len = line.length;
        line = line.replaceAll("  ", " ");
      } while (len !== line.length);
      line = line.trim();

      const parts = line.split(" ");
      if (parts.length < 2) continue;

      const flags = parts[0];
      const description = parts.slice(2).join(" ");
      const formats = parts[1].split(",");

      if (description.startsWith("piped ")) continue;
      if (description.toLowerCase().includes("subtitle")) continue;
      if (description.toLowerCase().includes("manifest")) continue;

      for (const format of formats) {
        let primaryFormat = formats[0];
        if (primaryFormat === "png") primaryFormat = "apng";

        let extension, mimeType;
        try {
          const details = await getMuxerDetails(primaryFormat);
          extension = details.extension;
          mimeType = details.mimeType;
        } catch {
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
      // AV1 doesn't seem to be included in WASM FFmpeg
      "avif",
      // HEVC stalls when attempted
      "hevc",
      // RTSP stalls when attempted
      "rtsp",
    ];
    this.supportedFormats = this.supportedFormats.filter((c) => !remove.includes(c.internal));

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

    // Encoding-specific formats
    this.supportedFormats.push(Formats.OGG_VORBIS.builder("ogg").to());

    this.supportedFormats.push(Formats.OGG_OPUS.builder("ogg").to());

    this.#ffmpeg.terminate();

    this.ready = true;
  }

  /**
   * Cuts each file without re-encoding it, and returns one output per input.
   * Each file is read on its own and not through the concat list of {@link doConvert}:
   * seeking in that list loses every frame of a copied stream.
   */
  async #copyStreams(
    inputFiles: FileData[],
    format: FileFormat,
    settings: ConversionSettings,
    ctx?: ConvertContext,
  ): Promise<FileData[]> {
    const ffmpeg = this.#ffmpeg!;
    const { input, output } = ffmpegCopyArgs(settings);
    const entryName = `input.${format.extension}`;
    const outputFiles: FileData[] = [];

    for (const file of inputFiles) {
      ctx?.throwIfAborted();
      await ffmpeg.writeFile(entryName, new Uint8Array(file.bytes));
      let code = -1;
      const stdout = await this.getStdout(async () => {
        code = await ffmpeg.exec([
          "-hide_banner",
          ...input,
          "-i",
          entryName,
          "-f",
          format.internal,
          ...output,
          "output",
        ]);
      });
      ctx?.throwIfAborted();
      await ffmpeg.deleteFile(entryName);

      if (code !== 0) throw new Error(`FFmpeg could not copy the streams of ${file.name}.`);
      // a start past the end makes FFmpeg seek back to the last keyframe and copy from there,
      // and it calls a file without a single packet a success
      const [, hours, minutes, seconds] = /Duration: (\d+):(\d+):([\d.]+)/.exec(stdout) ?? [];
      const duration = Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
      if ((settings.start ?? 0) >= duration || stdout.includes("video:0kB audio:0kB")) {
        throw new Error(
          `Nothing of ${file.name} lies between the start and the end that were set.`,
        );
      }
      const bytes = (await ffmpeg.readFile("output")) as Uint8Array;
      await ffmpeg.deleteFile("output");
      outputFiles.push({ name: file.name, bytes: new Uint8Array(bytes) });
    }

    ctx?.progress("Conversion complete!", 1);
    return outputFiles;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
    args?: string[],
    ctx?: ConvertContext,
  ): Promise<FileData[]> {
    if (!this.#ffmpeg) {
      throw new InitializationError("Handler not initialized.");
    }

    ctx?.throwIfAborted();
    // threads need SharedArrayBuffer, which a page only has when it is cross-origin isolated
    this.#threads =
      !this.#threadsHung &&
      globalThis.crossOriginIsolated === true &&
      THREADED_OUTPUTS.has(outputFormat.internal);
    ctx?.log(this.#threads ? "Reloading FFmpeg with threads..." : "Reloading FFmpeg...");
    await this.reloadFFmpeg();

    if (ctx) {
      const abortHandler = () => {
        ctx.log("Abort signal received — terminating FFmpeg.", "error");
        this.terminateFFmpeg();
      };
      ctx.signal.addEventListener("abort", abortHandler, { once: true });

      this.#ffmpeg.on("log", ({ message, type }) => {
        let level: "log" | "error" | "warn" = "log";
        if (type === "stderr") level = "warn";
        ctx.log(message, level);
      });

      this.#ffmpeg.on("progress", ({ progress, time }) => {
        if (!Number.isFinite(progress) || progress < 0) {
          const seconds = time / 1_000_000;
          ctx.progress(`Transcoding... (${seconds.toFixed(1)}s processed)`, (p) =>
            Math.min(0.95, p + 0.001),
          );
        } else {
          ctx.progress(`Transcoding...`, Math.max(0, Math.min(0.99, progress)));
        }
      });
    }

    const settings = ctx?.settings ?? {};
    // copied streams fit the container they came from, so this is limited to the same format
    if (settings.copyStreams && sameFormat(inputFormat, outputFormat)) {
      return this.#copyStreams(inputFiles, outputFormat, settings, ctx);
    }
    // the concat input below joins the files into one, which would get a single fade or cut
    if (ffmpegAudioFilter(settings) && inputFiles.length > 1) {
      const outputs: FileData[] = [];
      for (const file of inputFiles) {
        outputs.push(...(await this.doConvert([file], inputFormat, outputFormat, args, ctx)));
      }
      return outputs;
    }

    let forceFPS = 0;
    if (inputFormat.mime === "image/png" || inputFormat.mime === "image/jpeg") {
      forceFPS = inputFiles.length < 30 ? 1 : 30;
    }

    let fileIndex = 0;
    let listString = "";
    ctx?.log(`Preparing ${inputFiles.length} input files...`);
    for (const file of inputFiles) {
      ctx?.throwIfAborted();
      const entryName = `file_${fileIndex++}.${inputFormat.extension}`;
      await this.#ffmpeg.writeFile(entryName, new Uint8Array(file.bytes));
      listString += `file '${entryName}'\n`;
      if (forceFPS) listString += `duration ${1 / forceFPS}\n`;
    }
    await this.#ffmpeg.writeFile("list.txt", encode(listString));

    const input = ["-hide_banner", "-f", "concat", "-safe", "0", "-i", "list.txt"];
    const command = [...input];

    // GIF's default palette causes heavy banding, so generate one from the input first.
    // This takes two passes because a single-pass split filter buffers every frame in memory.
    // Skipped on auto-fix retries that add "-vf", which can't be combined with "-lavfi".
    const scale = ffmpegScaleFilter(settings);
    const usePalette =
      outputFormat.internal === "gif" &&
      !args?.includes("-vf") &&
      // the palette only needs the colours of the section that is kept
      (await this.#ffmpeg.exec([
        ...input,
        ...ffmpegTrimArgs(settings),
        "-vf",
        "palettegen",
        "palette.png",
      ])) === 0;
    ctx?.throwIfAborted();
    if (usePalette) {
      const filter = scale ? `[0:v]${scale}[scaled];[scaled][1:v]paletteuse` : "paletteuse";
      command.push("-i", "palette.png", "-lavfi", filter);
    }

    command.push("-f", outputFormat.internal);
    if (outputFormat.mime === "video/mp4") {
      command.push("-pix_fmt", "yuv420p");
    } else if (outputFormat.internal === "dvd") {
      command.push("-vf", "setsar=1", "-target", "ntsc-dvd", "-pix_fmt", "rgb24");
    } else if (outputFormat.internal === "vcd") {
      command.push("-vf", "scale=352:288,setsar=1", "-target", "pal-vcd", "-pix_fmt", "rgb24");
    } else if (outputFormat.internal === "webm") {
      // VP8: the VP9 encoder this core picks by default crashes on its first frame
      command.push("-c:v", "libvpx");
    } else if (outputFormat.internal === "asf") {
      command.push("-b:v", "15M", "-b:a", "192k");
    } else if (outputFormat.format === "ogg-vorbis") {
      command.push("-c:a", "libvorbis");
    } else if (outputFormat.format === "ogg-opus") {
      command.push("-c:a", "libopus");
    }
    command.push(...ffmpegSettingsArgs(settings));
    const audioFilter = ffmpegAudioFilter(settings);
    if (audioFilter) command.push("-af", audioFilter);
    if (settings.normalize && !args?.includes("-ar")) {
      // loudnorm works at 192 kHz and hands that on, so ask for the rate the file came in
      const probe = await this.getStdout(async () => {
        await this.#ffmpeg!.exec(["-hide_banner", "-i", `file_0.${inputFormat.extension}`]);
      });
      command.push("-ar", /Audio: .*?, (\d+) Hz/.exec(probe)?.[1] ?? "48000");
    }
    // FFmpeg gives the filters one thread per core, and with ten the multithreaded core hangs
    // before the first frame (eight still work). The encoder keeps its own threads.
    if (this.#threads) command.push("-filter_threads", "4");
    if (args) command.push(...args);
    // the audio half of a speed change is in the "-af" chain above
    const speed = categoriesOf(outputFormat).includes(Category.VIDEO)
      ? ffmpegSpeedFilter(settings)
      : undefined;
    const videoFilter = [scale, speed].filter(Boolean).join(",");
    if (videoFilter && !usePalette) {
      // FFmpeg only honours the last "-vf", so join an existing one instead of adding another
      const vf = command.lastIndexOf("-vf");
      if (vf === -1) command.push("-vf", videoFilter);
      else command[vf + 1] = `${videoFilter},${command[vf + 1]}`;
    }
    command.push("output");

    let hung = false;
    const stdout = await this.getStdout(async () => {
      const ffmpeg = this.#ffmpeg!;
      const run = ffmpeg.exec(command);
      if (!this.#threads) return void (await run);
      hung = await stalls(
        run,
        (alive) => {
          ffmpeg.on("log", alive);
          return () => ffmpeg.off("log", alive);
        },
        STALL_MS,
      );
    });

    ctx?.throwIfAborted();
    if (hung) {
      // the reload at the start of the next attempt ends the hung core
      ctx?.log("FFmpeg stopped responding with threads, starting again without.", "warn");
      this.#threadsHung = true;
      return this.doConvert(inputFiles, inputFormat, outputFormat, args, ctx);
    }
    ctx?.log("Cleaning up input files...");
    for (let i = 0; i < fileIndex; i++) {
      const entryName = `file_${i}.${inputFormat.extension}`;
      await this.#ffmpeg.deleteFile(entryName);
    }

    if (stdout.includes("Conversion failed!\n")) {
      ctx?.log("Conversion failed, attempting auto-fix...", "error");
      const oldArgs = args ?? [];
      if (stdout.includes(" not divisible by") && !oldArgs.includes("-vf")) {
        const division = stdout.split(" not divisible by ")[1].split(" ")[0];
        return this.doConvert(
          inputFiles,
          inputFormat,
          outputFormat,
          [
            ...oldArgs,
            "-vf",
            `pad=ceil(iw/${division})*${division}:ceil(ih/${division})*${division}`,
          ],
          ctx,
        );
      }
      if (stdout.includes("width and height must be a multiple of") && !oldArgs.includes("-vf")) {
        const division = stdout
          .split("width and height must be a multiple of ")[1]
          .split(" ")[0]
          .split("")[0];
        return this.doConvert(
          inputFiles,
          inputFormat,
          outputFormat,
          [
            ...oldArgs,
            "-vf",
            `pad=ceil(iw/${division})*${division}:ceil(ih/${division})*${division}`,
          ],
          ctx,
        );
      }
      if (stdout.includes("Valid sizes are") && !oldArgs.includes("-s")) {
        const newSize = stdout.split("Valid sizes are ")[1].split(".")[0].split(" ").pop();
        if (typeof newSize !== "string") throw stdout;
        return this.doConvert(
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
        return this.doConvert(
          inputFiles,
          inputFormat,
          outputFormat,
          [...oldArgs, "-ar", acceptedBitrate],
          ctx,
        );
      }

      throw stdout;
    }

    let bytes: Uint8Array;

    ctx?.log("Reading output file...");
    let fileData;
    try {
      fileData = await this.#ffmpeg.readFile("output");
    } catch (e) {
      ctx?.log(`Output file not created: ${e}`, "error");
      throw `Output file not created: ${e}`;
    }

    if (!fileData || (fileData instanceof Uint8Array && fileData.length === 0)) {
      ctx?.log("FFmpeg failed to produce output file", "error");
      throw "FFmpeg failed to produce output file";
    }
    if (!(fileData instanceof Uint8Array)) {
      bytes = encode(fileData);
    } else {
      bytes = new Uint8Array(fileData?.buffer);
    }

    await this.#ffmpeg.deleteFile("output");
    await this.#ffmpeg.deleteFile("list.txt");
    if (usePalette) await this.#ffmpeg.deleteFile("palette.png");

    const name = changeExt(inputFiles[0].name, outputFormat.extension);

    ctx?.progress("Conversion complete!", 1);
    ctx?.log(`Successfully converted to ${name} (${bytes.length} bytes)`);

    return [{ bytes, name }];
  }
}

export default FFmpegHandler;
