import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import normalizeMimeType from "../normalizeMimeType.ts";
import CommonFormats, { Category } from "src/CommonFormats.ts";
import initReflo, { decode, encode, get_flo_file_info } from "@flo-audio/reflo";
import { WaveFile } from "wavefile";

class floHandler implements FormatHandler {
  public name: string = "flo";
  public supportedFormats: FileFormat[] = [];
  public ready: boolean = false;
  public offload: boolean = true;

  async init() {
    await initReflo({ module_or_path: "/convert/wasm/reflo_bg.wasm" });
    this.supportedFormats = [
      {
        name: "Flo Audio",
        format: "flo",
        extension: "flo",
        mime: normalizeMimeType("audio/flo"),
        from: true,
        to: true,
        internal: "flo",
        category: Category.AUDIO,
        lossless: false,
      },
      CommonFormats.WAV.builder("wav").allowFrom().allowTo().markLossless(),
      {
        name: "Raw PCM Float32LE",
        format: "f32le",
        extension: "pcm",
        mime: normalizeMimeType("video/f32le"),
        from: true,
        to: true,
        internal: "f32le",
        category: Category.AUDIO,
        lossless: true,
      },
    ];
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {
    if (!inputFiles.length) throw new RangeError("No input files.");

    return inputFiles.map((file) => {
      const idx = file.name.lastIndexOf(".");
      const baseName = idx > 0 ? file.name.slice(0, idx) : file.name;
      let samples: Float32Array;
      let sampleRate: number;
      let channels: number;

      if (inputFormat.internal === "flo") {
        samples = decode(file.bytes);
        const info = get_flo_file_info(file.bytes);
        sampleRate = info.sample_rate;
        channels = info.channels;
        info.free();
      } else if (inputFormat.internal === "wav") {
        const wav = new WaveFile(file.bytes);
        wav.toBitDepth("32f");
        samples = new Float32Array(wav.getSamples(true, Float32Array));
        const fmt = wav.fmt as { sampleRate: number; numChannels: number };
        sampleRate = fmt.sampleRate;
        channels = fmt.numChannels;
      } else if (inputFormat.internal === "f32le") {
        if (file.bytes.length % 4 !== 0) {
          throw new RangeError("Raw Float32LE PCM must contain whole 4-byte samples.");
        }
        const view = new DataView(file.bytes.buffer, file.bytes.byteOffset, file.bytes.byteLength);
        samples = new Float32Array(file.bytes.length / 4);
        for (let i = 0; i < samples.length; i++) samples[i] = view.getFloat32(i * 4, true);
        sampleRate = 44100;
        channels = 1;
      } else {
        throw new TypeError(
          `floHandler: unsupported conversion ${inputFormat.format} -> ${outputFormat.format}`,
        );
      }

      if (outputFormat.internal === "flo") {
        return { bytes: encode(samples, sampleRate, channels, 32, null), name: baseName + ".flo" };
      } else if (outputFormat.internal === "wav") {
        const wav = new WaveFile();
        wav.fromScratch(channels, sampleRate, "32f", samples);
        wav.toBitDepth("16");
        return { bytes: wav.toBuffer(), name: baseName + ".wav" };
      } else if (outputFormat.internal === "f32le") {
        const bytes = new Uint8Array(samples.length * 4);
        const view = new DataView(bytes.buffer);
        for (let i = 0; i < samples.length; i++) view.setFloat32(i * 4, samples[i], true);
        return { bytes, name: baseName + ".pcm" };
      } else {
        throw new TypeError(
          `floHandler: unsupported conversion ${inputFormat.format} -> ${outputFormat.format}`,
        );
      }
    });
  }
}

export default floHandler;
