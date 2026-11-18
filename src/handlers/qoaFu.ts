import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import Formats from "src/Formats.ts";
import { QOAEncoder, QOADecoder, QOABase } from "qoa-fu";
import { changeExt, ownedBytes } from "src/common/index.ts";
import { typedWaveFile } from "src/common/wav.ts";

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
  private buffer: Uint8Array<ArrayBuffer>;
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

  public getData(): Uint8Array<ArrayBuffer> {
    return this.buffer.subarray(0, this.pos);
  }
}

class qoaFuHandler implements FormatHandler {
  public readonly name = "qoaFu";
  public supportedFormats = [
    Formats.QOA.builder("qoa").fromTo(),
    Formats.WAV.builder("wav").fromTo(),
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
          const frameSamples = decoder.readFrame(
            audioData.subarray(
              pos,
              Math.min(
                QOABase.MAX_FRAME_SAMPLES * decoder.getChannels() + pos,
                decoder.getTotalSamples() * decoder.getChannels(),
              ),
            ),
          );
          if (frameSamples <= 0) {
            throw new Error(`Invalid or truncated QOA frame in "${inputFile.name}".`);
          }
          pos += frameSamples * decoder.getChannels();
        }

        const wav = typedWaveFile();
        wav.fromScratch(decoder.getChannels(), decoder.getSampleRate(), "16", audioData);

        const wavBytes = ownedBytes(wav.toBuffer());
        const name = changeExt(inputFile.name, "wav");
        outputFiles.push({ bytes: wavBytes, name });
      }
    } else if (inputFormat.internal === "wav" && outputFormat.internal === "qoa") {
      // WAV => QOA
      for (const inputFile of inputFiles) {
        const wav = typedWaveFile(inputFile.bytes);
        wav.toBitDepth("32f");
        const length = wav.data.samples.length / wav.fmt.blockAlign;

        const encoder = new uint8ArrayQOAEncoder((length * wav.fmt.numChannels * 4) / 8 + 4096);
        if (!encoder.writeHeader(length, wav.fmt.numChannels, wav.fmt.sampleRate)) {
          throw new Error("Failed to write QOA header.");
        }

        const maybeChannels = wav.getSamples(false, Float32Array);
        const channelData = Array.isArray(maybeChannels) ? maybeChannels : [maybeChannels];

        let offset = 0;
        while (offset < length) {
          const frameSamples = Math.min(QOABase.MAX_FRAME_SAMPLES, length - offset);
          const frameBuffer = new Int16Array(frameSamples * wav.fmt.numChannels);

          let index = 0;
          for (let i = 0; i < frameSamples; i++) {
            for (let c = 0; c < wav.fmt.numChannels; c++) {
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
        const name = changeExt(inputFile.name, "qoa");
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
