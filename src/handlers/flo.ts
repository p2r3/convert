import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import Formats from "src/Formats.ts";
import initReflo, { decode, encode, get_flo_file_info } from "@flo-audio/reflo";
import refloWasmUrl from "@flo-audio/reflo/reflo_bg.wasm?url";
import { changeExt, ownedBytes } from "src/common/index.ts";
import { typedWaveFile } from "src/common/wav.ts";

class floHandler implements FormatHandler {
  public readonly name = "flo";
  public supportedFormats = [
    Formats.FLO.builder("flo").fromTo(),
    Formats.WAV.builder("wav").lossless().fromTo(),
    Formats.F32LE.builder("f32le").lossless().fromTo(),
  ];
  public ready = false;

  async init() {
    await initReflo({ module_or_path: refloWasmUrl });
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {
    if (!inputFiles.length) throw new RangeError("No input files.");

    return inputFiles.map((file) => {
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
        const wav = typedWaveFile(file.bytes);
        wav.toBitDepth("32f");
        samples = wav.getSamples(true, Float32Array);
        sampleRate = wav.fmt.sampleRate;
        channels = wav.fmt.numChannels;
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
        return {
          bytes: ownedBytes(encode(samples, sampleRate, channels, 32, null)),
          name: changeExt(file.name, "flo"),
        };
      } else if (outputFormat.internal === "wav") {
        const wav = typedWaveFile();
        wav.fromScratch(channels, sampleRate, "32f", samples);
        wav.toBitDepth("16");
        return { bytes: ownedBytes(wav.toBuffer()), name: changeExt(file.name, "wav") };
      } else if (outputFormat.internal === "f32le") {
        const bytes = new Uint8Array(samples.length * 4);
        const view = new DataView(bytes.buffer);
        for (let i = 0; i < samples.length; i++) view.setFloat32(i * 4, samples[i], true);
        return { bytes, name: changeExt(file.name, "pcm") };
      } else {
        throw new TypeError(
          `floHandler: unsupported conversion ${inputFormat.format} -> ${outputFormat.format}`,
        );
      }
    });
  }
}

export default floHandler;
