import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats, { Category } from "src/CommonFormats.ts";
import { QOAEncoder, QOADecoder, QOABase } from "qoa-fu";
import { WaveFile } from "wavefile";

class uint8ArrayQOADecoder extends QOADecoder {
  private data: Uint8Array;
  private pos = 0;

  constructor(data: Uint8Array) {
    super();
    this.data = data;
  }

  protected readByte(): number {
    if (this.pos >= this.data.length) {
      return -1;
    }
    return this.data[this.pos++];
  }

  protected seekToByte(position: number): void {
    this.pos = position;
  }
}

class uint8ArrayQOAEncoder extends QOAEncoder {
  private buffer: Uint8Array;
  private pos = 0;

  constructor(estimatedSize: number) {
    super();
    this.buffer = new Uint8Array(estimatedSize);
  }

  protected writeLong(l: bigint): boolean {
    for (let i = 7; i >= 0; i--) {
      this.buffer[this.pos++] = Number((l >> BigInt(i * 8)) & 0xffn);
    }
    return true;
  }

  public getData(): Uint8Array {
    return this.buffer.subarray(0, this.pos);
  }
}

class qoaFuHandler implements FormatHandler {
  public name: string = "qoaFu";
  public supportedFormats: FileFormat[] = [
    {
      name: "Quite OK Audio",
      format: "qoa",
      extension: "qoa",
      mime: "audio/x-qoa", // I have to put something here
      from: true,
      to: true,
      internal: "qoa",
      category: Category.AUDIO,
      lossless: false,
    },
    CommonFormats.WAV.builder("wav").allowFrom(true).allowTo(true),
  ];
  public ready: boolean = false;
  public offload: boolean = true;

  async init() {
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];

    if (inputFormat.internal === "qoa" && outputFormat.internal == "wav") {
      // QOA => WAV
      for (const inputFile of inputFiles) {
        const decoder = new uint8ArrayQOADecoder(inputFile.bytes);
        if (!decoder.readHeader()) {
          throw new Error("Invalid QOA header.");
        }
        const audioData = new Int16Array(decoder.getTotalSamples() * decoder.getChannels());
        let pos = 0;
        while (!decoder.isEnd()) {
          pos +=
            decoder.readFrame(
              audioData.subarray(
                pos,
                Math.min(
                  QOABase.MAX_FRAME_SAMPLES * decoder.getChannels() + pos,
                  decoder.getTotalSamples() * decoder.getChannels(),
                ),
              ),
            ) * decoder.getChannels();
        }

        const wav = new WaveFile();
        wav.fromScratch(decoder.getChannels(), decoder.getSampleRate(), "16", audioData);

        const wavBytes = wav.toBuffer();
        const name = inputFile.name.split(".").slice(0, -1).join(".") + ".wav";
        outputFiles.push({ bytes: wavBytes, name });
      }
    } else if (inputFormat.internal === "wav" && outputFormat.internal === "qoa") {
      // WAV => QOA
      for (const inputFile of inputFiles) {
        const wav = new WaveFile(inputFile.bytes);
        wav.toBitDepth("32f");
        const wavData = wav.data as { samples: Uint8Array }; // idiot library
        const wavFmt = wav.fmt as { sampleRate: number; numChannels: number; blockAlign: number };
        const length = wavData.samples.length / wavFmt.blockAlign;

        const encoder = new uint8ArrayQOAEncoder((length * wavFmt.numChannels * 4) / 8 + 4096);
        if (!encoder.writeHeader(length, wavFmt.numChannels, wavFmt.sampleRate)) {
          throw new Error("Failed to write QOA header.");
        }

        const maybeChannels = wav.getSamples(false, Float32Array) as unknown as
          | Float32Array
          | Float32Array[];
        const channelData = Array.isArray(maybeChannels) ? maybeChannels : [maybeChannels];

        let offset = 0;
        while (offset < length) {
          const frameSamples = Math.min(QOABase.MAX_FRAME_SAMPLES, length - offset);
          const frameBuffer = new Int16Array(frameSamples * wavFmt.numChannels);

          let index = 0;
          for (let i = 0; i < frameSamples; i++) {
            for (let c = 0; c < wavFmt.numChannels; c++) {
              let sample = channelData[c][offset + i];
              sample = sample < -1 ? -1 : sample > 1 ? 1 : sample;
              frameBuffer[index++] = sample < 0 ? sample * 32768 : sample * 32767;
            }
          }

          if (!encoder.writeFrame(frameBuffer, frameSamples)) {
            throw new Error("Failed to write QOA frame.");
          }

          offset += frameSamples;
        }

        const qoaBytes = encoder.getData();
        const name = inputFile.name.split(".").slice(0, -1).join(".") + ".qoa";
        outputFiles.push({ bytes: qoaBytes, name });
      }
    } else {
      {
        throw new TypeError(
          `Unsupported conversion path: ${inputFormat.internal} -> ${outputFormat.internal}`,
        );
      }
    }

    return outputFiles;
  }
}

export default qoaFuHandler;
