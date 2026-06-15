import { MultiSelectOption, NumberOption, SelectOption, TextOption, type FileData, type FileFormat, type FormatHandler } from "../FormatHandler.ts";
import type { ConvertContext } from "../ui/ProgressStore.js";

import { FFmpeg } from "@ffmpeg/ffmpeg";
import type { LogEvent } from "@ffmpeg/ffmpeg";

import mime from "mime";
import normalizeMimeType from "../normalizeMimeType.ts";
import CommonFormats from "src/CommonFormats.ts";

class FFmpegHandler implements FormatHandler {

  static formatNames: Map<string, string> = new Map([
    ["mp4", CommonFormats.MP4.name],
    ["m4a", "MPEG-4 Audio"],
    ["flac", CommonFormats.FLAC.name],
    ["wav", CommonFormats.WAV.name],
    ["mp3", CommonFormats.MP3.name],
    ["ogg", CommonFormats.OGG.name],
    ["matroska", "Matroska / WebM"],
    ["mov", "QuickTime / MOV"],
    ["3gp", "3GPP Multimedia Container"],
    ["3g2", "3GPP2 Multimedia Container"],
    ["asf", "Windows Media Video (WMV)"]
  ]);

  public name: string = "FFmpeg";
  public supportedFormats: FileFormat[] = [];
  public ready: boolean = false;
  private readonly options: {
    imageTimingMode: "auto" | "fps" | "duration";
    imageSequenceFps: number;
    singleImageDurationSeconds: number;
    autoFixStrategies: string[];
    outputPreset: "source" | "small" | "balanced" | "quality";
    resizeMode: "none" | "720p" | "1080p" | "1440p" | "4k" | "custom";
    customWidth: number;
    customHeight: number;
    outputFrameRateMode: "keep" | "set";
    outputFrameRate: number;
    customArgs: string;
  } = {
    imageTimingMode: "auto",
    imageSequenceFps: 30,
    singleImageDurationSeconds: 3,
    autoFixStrategies: ["divisible-pad", "multiple-size", "valid-size", "sample-rate"],
    outputPreset: "source",
    resizeMode: "none",
    customWidth: 1280,
    customHeight: 720,
    outputFrameRateMode: "keep",
    outputFrameRate: 30,
    customArgs: ""
  };

  #ffmpeg?: FFmpeg;
  #ffmpegLoaded: boolean = false;
  #initPromise?: Promise<void>;

  #stdout: string = "";
  #boundStdoutHandler = (log: LogEvent) => {
    this.#stdout += log.message + "\n";
  };
  clearStdout () {
    this.#stdout = "";
  }
  async getStdout (callback: () => void | Promise<void>) {
    if (!this.#ffmpeg) return "";
    this.clearStdout();
    this.#ffmpeg.on("log", this.#boundStdoutHandler);
    await callback();
    this.#ffmpeg.off("log", this.#boundStdoutHandler);
    return this.#stdout;
  }

  async loadFFmpeg () {
    if (!this.#ffmpeg) return;
    await this.#ffmpeg.load({
      coreURL: "/convert/wasm/ffmpeg-core.js",
      wasmURL: "/convert/wasm/ffmpeg-core.wasm"
    });
    this.#ffmpegLoaded = true;
  }
  terminateFFmpeg () {
    if (!this.#ffmpeg || !this.#ffmpegLoaded) return;
    try {
      this.#ffmpeg.terminate();
    } catch (e) {
      if (!(e instanceof Error) || !e.message.includes("called FFmpeg.terminate()")) {
        console.warn("FFmpeg termination warning:", e);
      }
    } finally {
      this.#ffmpegLoaded = false;
    }
  }
  async reloadFFmpeg () {
    if (!this.#ffmpeg) {
      this.#ffmpeg = new FFmpeg();
    }
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
  async execSafe (args: string[], timeout: number = -1, attempts: number = 1): Promise<void> {
    if (!this.#ffmpeg) throw "Handler not initialized.";
    try {
      if (timeout === -1) {
        await this.#ffmpeg.exec(args);
      } else {
        await Promise.race([
          this.#ffmpeg.exec(args, timeout),
          new Promise((_, reject) => setTimeout(reject, timeout))
        ]);
      }
    } catch (e) {
      if (!e || (
        typeof e === "string"
        && e.includes("out of bounds")
        && attempts > 1
      )) {
        await this.reloadFFmpeg();
        return await this.execSafe(args, timeout, attempts - 1);
      }
      console.error(e);
      throw e;
    }
  }

  async init () {
    if (this.ready) return;
    if (this.#initPromise) return this.#initPromise;

    this.#initPromise = (async () => {
      this.#ffmpeg = new FFmpeg();
      this.#ffmpegLoaded = false;
      await this.loadFFmpeg();

    const getMuxerDetails = async (muxer: string) => {

      const stdout = await this.getStdout(async () => {
        await this.execSafe(["-hide_banner", "-h", "muxer=" + muxer], 3000, 5);
      });

      return {
        extension: stdout.split("Common extensions: ")[1].split(".")[0].split(",")[0],
        mimeType: stdout.split("Mime type: ")[1].split("\n")[0].split(".").slice(0, -1).join(".")
      };
    }

    const stdout = await this.getStdout(async () => {
      await this.execSafe(["-formats", "-hide_banner"], 3000, 5);
    });
    const lines = stdout.split(" --\n")[1].split("\n");

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
        } catch (e) {
          extension = format;
          mimeType = mime.getType(format) || ("video/" + format);
        }
        mimeType = normalizeMimeType(mimeType);

        let category = mimeType.split("/")[0];
        if (
          description.includes("PCM")
          || description.includes("PWM")
          || primaryFormat === "aptx"
          || primaryFormat === "aptx_hd"
          || primaryFormat === "codec2"
          || primaryFormat === "codec2raw"
          || primaryFormat === "apm"
          || primaryFormat === "alp"
        ) {
          category = "audio";
          mimeType = "audio/" + mimeType.split("/")[1];
        } else if (
          category !== "audio"
          && category !== "video"
          && category !== "image"
        ) {
          if (description.toLowerCase().includes("audio")) category = "audio";
          else category = "video";
        }

        // Canonicalize MIDI so graph nodes match dedicated MIDI handlers (which use "mid").
        // Without this, FFmpeg can expose "midi" and split routing into a separate node.
        const canonicalFormat = mimeType === "audio/midi" ? "mid" : format;

        const name = FFmpegHandler.formatNames.get(canonicalFormat) || (description + (formats.length > 1 ? (" / " + format) : ""));

        this.supportedFormats.push({
          name: name,
          format: canonicalFormat,
          extension,
          mime: mimeType,
          from: flags.includes("D"),
          to: flags.includes("E"),
          internal: format,
          category,
          lossless: ["png", "bmp", "tiff"].includes(format)
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

    // AV1 doesn't seem to be included in WASM FFmpeg
    this.supportedFormats.splice(this.supportedFormats.findIndex(c => c.mime === "image/avif"), 1);
    // HEVC stalls when attempted
    this.supportedFormats.splice(this.supportedFormats.findIndex(c => c.internal === "hevc"), 1);
    // RTSP stalls when attempted
    this.supportedFormats.splice(this.supportedFormats.findIndex(c => c.internal === "rtsp"), 1);

    // Add .qta (QuickTime Audio) support - uses same mov demuxer
    this.supportedFormats.push({
      name: "QuickTime Audio",
      format: "qta",
      extension: "qta",
      mime: "video/quicktime",
      from: true,
      to: true,
      internal: "mov",
      category: "audio",
      lossless: false
    });

    // Add .wmv (Windows Media Video) support - uses ASF container
    this.supportedFormats.push({
      name: "Windows Media Video",
      format: "wmv",
      extension: "wmv",
      mime: "video/x-ms-asf",
      from: true,
      to: true,
      internal: "asf",
      category: "video"
    });

    // Normalize Bink metadata to ensure ".bik" files are detected by extension.
    const binkFormats = this.supportedFormats.filter(f =>
      f.internal === "bink"
      || f.format === "bink"
      || f.extension === "bik"
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
    this.supportedFormats.push(CommonFormats.PNG.builder("png").allowFrom());

    this.terminateFFmpeg();

    this.ready = true;
    })();

    try {
      await this.#initPromise;
    } finally {
      this.#initPromise = undefined;
    }
  }

  getOptions() {
    return [
      new SelectOption(
        "output-preset",
        "Output preset",
        [
          { label: "Source compatible", value: "source", description: "Keep FFmpeg defaults and avoid forcing bitrate changes." },
          { label: "Small file", value: "small", description: "Lower bitrate for smaller output files." },
          { label: "Balanced", value: "balanced", description: "Balanced quality and file size." },
          { label: "High quality", value: "quality", description: "Higher bitrate for better visual quality." }
        ],
        () => this.options.outputPreset,
        (value) => { this.options.outputPreset = value as typeof this.options.outputPreset; },
        {
          defaultValue: "source",
          description: "Applies when converting into video outputs."
        }
      ),
      new SelectOption(
        "resize-mode",
        "Resize",
        [
          { label: "Keep original", value: "none", description: "Do not force output size." },
          { label: "1280 x 720 (720p)", value: "720p" },
          { label: "1920 x 1080 (1080p)", value: "1080p" },
          { label: "2560 x 1440 (1440p)", value: "1440p" },
          { label: "3840 x 2160 (4K)", value: "4k" },
          { label: "Custom", value: "custom" }
        ],
        () => this.options.resizeMode,
        (value) => { this.options.resizeMode = value as typeof this.options.resizeMode; },
        {
          defaultValue: "none",
          description: "Resize and pad to common output dimensions for better playback compatibility."
        }
      ),
      new NumberOption(
        "resize-custom-width",
        "Custom width",
        () => this.options.customWidth,
        (value) => { this.options.customWidth = value; },
        {
          min: 16,
          max: 7680,
          step: 2,
          unit: "px",
          defaultValue: 1280,
          showWhen: (values) => values["resize-mode"] === "custom"
        }
      ),
      new NumberOption(
        "resize-custom-height",
        "Custom height",
        () => this.options.customHeight,
        (value) => { this.options.customHeight = value; },
        {
          min: 16,
          max: 4320,
          step: 2,
          unit: "px",
          defaultValue: 720,
          showWhen: (values) => values["resize-mode"] === "custom"
        }
      ),
      new SelectOption(
        "output-frame-rate-mode",
        "Frame rate",
        [
          { label: "Keep source", value: "keep", description: "Preserve source frame rate when possible." },
          { label: "Set custom FPS", value: "set", description: "Force output frame rate." }
        ],
        () => this.options.outputFrameRateMode,
        (value) => { this.options.outputFrameRateMode = value as typeof this.options.outputFrameRateMode; },
        {
          defaultValue: "keep"
        }
      ),
      new NumberOption(
        "output-frame-rate",
        "Target FPS",
        () => this.options.outputFrameRate,
        (value) => { this.options.outputFrameRate = value; },
        {
          min: 1,
          max: 120,
          step: 1,
          unit: "fps",
          control: "slider",
          defaultValue: 30,
          showWhen: (values) => values["output-frame-rate-mode"] === "set"
        }
      ),
      new SelectOption(
        "image-timing-mode",
        "Image sequence timing",
        [
          { label: "Auto", value: "auto", description: "Use 1 FPS for short image lists, otherwise 30 FPS." },
          { label: "Custom FPS", value: "fps", description: "Force a constant FPS when converting images to video." },
          { label: "Single image duration", value: "duration", description: "For one image input, hold the frame for N seconds." }
        ],
        () => this.options.imageTimingMode,
        (value) => { this.options.imageTimingMode = value as typeof this.options.imageTimingMode; }
      ),
      new NumberOption(
        "image-sequence-fps",
        "Custom image FPS",
        () => this.options.imageSequenceFps,
        (value) => { this.options.imageSequenceFps = value; },
        {
          min: 1,
          max: 120,
          step: 1,
          unit: "fps",
          control: "slider",
          defaultValue: 30,
          showWhen: (values) => values["image-timing-mode"] === "fps"
        }
      ),
      new NumberOption(
        "single-image-duration",
        "Single image length",
        () => this.options.singleImageDurationSeconds,
        (value) => { this.options.singleImageDurationSeconds = value; },
        {
          min: 1,
          max: 60,
          step: 1,
          unit: "seconds",
          control: "slider",
          defaultValue: 3,
          showWhen: (values) => values["image-timing-mode"] === "duration"
        }
      ),
      new MultiSelectOption(
        "auto-fix-strategies",
        "Automatic FFmpeg fixes",
        [
          { label: "Pad dimensions", value: "divisible-pad", description: "Fix divisibility errors by padding frames." },
          { label: "Force multiple size", value: "multiple-size", description: "Pad width/height to required multiples." },
          { label: "Adjust output size", value: "valid-size", description: "Use one of FFmpeg's valid target sizes." },
          { label: "Adjust sample rate", value: "sample-rate", description: "Use a supported sample rate when needed." }
        ],
        () => this.options.autoFixStrategies,
        (values) => {
          this.options.autoFixStrategies = values;
        },
        {
          defaultValue: ["divisible-pad", "multiple-size", "valid-size", "sample-rate"],
          description: "Select which recovery strategies FFmpeg may apply when conversion fails."
        }
      ),
      new TextOption(
        "custom-args",
        "Extra CLI arguments",
        () => this.options.customArgs,
        (value) => { this.options.customArgs = value; },
        {
          defaultValue: "",
          description: "Custom FFmpeg arguments (e.g. -c:v libx264 -crf 23)"
        }
      )
    ];
  }

  async doConvert (
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
    args?: string[],
    ctx?: ConvertContext
  ): Promise<FileData[]> {

    if (!this.#ffmpeg) {
      throw "Handler not initialized.";
    }

    ctx?.throwIfAborted();
    ctx?.log("Reloading FFmpeg...");
    await this.reloadFFmpeg();

    let totalDurationUs = 0;

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

        if (!totalDurationUs) {
          const durationMatch = message.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
          if (durationMatch) {
            const [, hours, minutes, seconds, centis] = durationMatch;
            totalDurationUs = (
              Number(hours) * 3600 +
              Number(minutes) * 60 +
              Number(seconds) +
              Number(centis) / 100
            ) * 1_000_000;
          }
        }
      });

      this.#ffmpeg.on("progress", ({ progress, time }) => {
        const timeUs = Math.max(0, time);

        if (totalDurationUs > 0 && timeUs > 0) {
          const timeBasedProgress = Math.min(0.99, timeUs / totalDurationUs);
          const seconds = (timeUs / 1_000_000).toFixed(1);
          const total = (totalDurationUs / 1_000_000).toFixed(1);
          ctx.progress(`Transcoding... (${seconds}s / ${total}s)`, timeBasedProgress);
        } else if (Number.isFinite(progress) && progress > 0 && progress <= 1) {
          ctx.progress(`Transcoding...`, Math.max(0, Math.min(0.99, progress)));
        } else if (timeUs > 0) {
          const seconds = (timeUs / 1_000_000).toFixed(1);
          ctx.progress(`Transcoding... (${seconds}s processed)`, p => Math.min(0.95, p + 0.005));
        }
      });
    }

    let forceFPS = 0;
    if (inputFormat.mime === "image/png" || inputFormat.mime === "image/jpeg") {
      if (this.options.imageTimingMode === "fps") {
        forceFPS = this.options.imageSequenceFps;
      } else if (this.options.imageTimingMode === "duration" && inputFiles.length === 1) {
        forceFPS = Math.max(1, Math.round(1 / this.options.singleImageDurationSeconds));
      } else {
        forceFPS = inputFiles.length < 30 ? 1 : 30;
      }
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
    await this.#ffmpeg.writeFile("list.txt", new TextEncoder().encode(listString));

    const command = ["-hide_banner", "-f", "concat", "-safe", "0", "-i", "list.txt", "-f", outputFormat.internal];
    const isVideoOutput = outputFormat.mime.startsWith("video/");
    const isAudioOutput = outputFormat.mime.startsWith("audio/");

    const presetBitrateMap: Record<Exclude<typeof this.options.outputPreset, "source">, { video: string; audio: string }> = {
      small: { video: "2M", audio: "128k" },
      balanced: { video: "5M", audio: "160k" },
      quality: { video: "12M", audio: "192k" }
    };

    const resizeTargets: Record<Exclude<typeof this.options.resizeMode, "none" | "custom">, { width: number; height: number }> = {
      "720p": { width: 1280, height: 720 },
      "1080p": { width: 1920, height: 1080 },
      "1440p": { width: 2560, height: 1440 },
      "4k": { width: 3840, height: 2160 }
    };

    const appendVideoFilter = (filter: string) => {
      const filterIndex = command.lastIndexOf("-vf");
      if (filterIndex !== -1 && filterIndex + 1 < command.length) {
        command[filterIndex + 1] = `${command[filterIndex + 1]},${filter}`;
      } else {
        command.push("-vf", filter);
      }
    };

    if (isVideoOutput) {
      if (this.options.outputPreset !== "source") {
        const bitrate = presetBitrateMap[this.options.outputPreset];
        command.push("-b:v", bitrate.video, "-b:a", bitrate.audio);
      }

      if (this.options.outputFrameRateMode === "set") {
        command.push("-r", String(this.options.outputFrameRate));
      }

      if (this.options.resizeMode !== "none") {
        const target = this.options.resizeMode === "custom"
          ? { width: this.options.customWidth, height: this.options.customHeight }
          : resizeTargets[this.options.resizeMode];
        const width = Math.max(16, Math.round(target.width / 2) * 2);
        const height = Math.max(16, Math.round(target.height / 2) * 2);
        appendVideoFilter(`scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`);
      }
    }

    if (isAudioOutput && this.options.outputPreset !== "source") {
      const bitrate = presetBitrateMap[this.options.outputPreset];
      command.push("-b:a", bitrate.audio);
    }

    if (outputFormat.mime === "video/mp4") {
      command.push("-pix_fmt", "yuv420p");
    } else if (outputFormat.internal === "dvd") {
      command.push("-vf", "setsar=1", "-target", "ntsc-dvd", "-pix_fmt", "rgb24");
    } else if (outputFormat.internal === "vcd") {
      command.push("-vf", "scale=352:288,setsar=1", "-target", "pal-vcd", "-pix_fmt", "rgb24");
    } else if (outputFormat.internal === "asf") {
      command.push("-b:v", "15M", "-b:a", "192k");
    }

    if (this.options.customArgs) {
      const parsedArgs = this.options.customArgs.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
      command.push(...parsedArgs.map(arg => arg.replaceAll(/^"|"$/g, "")));
    }

    if (args) command.push(...args);
    command.push("output");

    const stdout = await this.getStdout(async () => {
      await this.#ffmpeg!.exec(command);
    });

    ctx?.throwIfAborted();
    ctx?.log("Cleaning up input files...");
    for (let i = 0; i < fileIndex; i ++) {
      const entryName = `file_${i}.${inputFormat.extension}`;
      await this.#ffmpeg.deleteFile(entryName);
    }

    if (stdout.includes("Conversion failed!\n")) {

      ctx?.log("Conversion failed, attempting auto-fix...", "error");
      const oldArgs = args ?? [];
      if (stdout.includes(" not divisible by") && !oldArgs.includes("-vf") && this.options.autoFixStrategies.includes("divisible-pad")) {
        const division = stdout.split(" not divisible by ")[1].split(" ")[0];
        return this.doConvert(inputFiles, inputFormat, outputFormat, [...oldArgs, "-vf", `pad=ceil(iw/${division})*${division}:ceil(ih/${division})*${division}`], ctx);
      }
      if (stdout.includes("width and height must be a multiple of") && !oldArgs.includes("-vf") && this.options.autoFixStrategies.includes("multiple-size")) {
        const division = stdout.split("width and height must be a multiple of ")[1].split(" ")[0].split("")[0];
        return this.doConvert(inputFiles, inputFormat, outputFormat, [...oldArgs, "-vf", `pad=ceil(iw/${division})*${division}:ceil(ih/${division})*${division}`], ctx);
      }
      if (stdout.includes("Valid sizes are") && !oldArgs.includes("-s") && this.options.autoFixStrategies.includes("valid-size")) {
        const newSize = stdout.split("Valid sizes are ")[1].split(".")[0].split(" ").pop();
        if (typeof newSize !== "string") throw stdout;
        return this.doConvert(inputFiles, inputFormat, outputFormat, [...oldArgs, "-s", newSize], ctx);
      }
      if (stdout.includes("does not support that sample rate, choose from (") && !oldArgs.includes("-ar") && this.options.autoFixStrategies.includes("sample-rate")) {
        const acceptedBitrate = stdout.split("does not support that sample rate, choose from (")[1].split(", ")[0];
        return this.doConvert(inputFiles, inputFormat, outputFormat, [...oldArgs, "-ar", acceptedBitrate], ctx);
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
      const encoder = new TextEncoder();
      bytes = encoder.encode(fileData);
    } else {
      bytes = new Uint8Array(fileData?.buffer);
    }

    await this.#ffmpeg.deleteFile("output");
    await this.#ffmpeg.deleteFile("list.txt");

    const baseName = inputFiles[0].name.split(".").slice(0, -1).join(".");
    const name = baseName + "." + outputFormat.extension;

    ctx?.progress("Conversion complete!", 1);
    ctx?.log(`Successfully converted to ${name} (${bytes.length} bytes)`);

    return [{ bytes, name }];

  }

}

export default FFmpegHandler;
