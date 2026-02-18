import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

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
      this.buffer[this.pos++] = Number((l >> BigInt(i * 8)) & 0xFFn);
    }
    return true;
  }

  public getData(): Uint8Array {
    return this.buffer.subarray(0, this.pos);
  }
}

class qoaFuHandler implements FormatHandler {
  public name: string = "qoa-fu";
  public supportedFormats: FileFormat[] = [
    {
      name: "Quite OK Audio",
      format: "qoa",
      extension: "qoa",
      mime: "audio/x-qoa", // I have to put something here
      from: true,
      to: true,
      internal: "qoa"
    }
  ];
  public ready: boolean = false;

  #audioContext?: AudioContext;

  async init() {
    const dummy = document.createElement("audio");
    this.supportedFormats.push({
      name: "Waveform Audio File Format",
      format: "wav",
      extension: "wav",
      mime: "audio/wav",
      from: dummy.canPlayType("audio/wav") !== "",
      to: true,
      internal: "wav"
    });
    if (dummy.canPlayType("audio/mpeg")) this.supportedFormats.push({
      name: "MP3 Audio",
      format: "mp3",
      extension: "mp3",
      mime: "audio/mpeg",
      from: true,
      to: false,
      internal: "mp3"
    });
    if (dummy.canPlayType("audio/ogg")) this.supportedFormats.push({
      name: "Ogg Audio",
      format: "ogg",
      extension: "ogg",
      mime: "audio/ogg",
      from: true,
      to: false,
      internal: "ogg"
    });
    if (dummy.canPlayType("audio/flac")) this.supportedFormats.push({
      name: "Free Lossless Audio Codec",
      format: "flac",
      extension: "flac",
      mime: "audio/flac",
      from: true,
      to: false,
      internal: "flac"
    });
    dummy.remove();

    this.#audioContext = new AudioContext();
    this.ready = true;
  }

  async doConvert (
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {
    if (!this.ready || !this.#audioContext) {
      throw "Handler not initialized.";
    }

    const outputFiles: FileData[] = [];

    const inputIsQOA = (inputFormat.internal === "qoa");
    const outputIsQOA = (outputFormat.internal === "qoa");

    if (inputIsQOA === outputIsQOA) {
      throw "Invalid input/output format.";
    }

    if (inputIsQOA) { // QOA => WAV
      for (const inputFile of inputFiles) {
          const decoder = new uint8ArrayQOADecoder(inputFile.bytes);
          if (!decoder.readHeader()) {
            throw "Invalid QOA header."
          }
          const audioData = new Int16Array(decoder.getTotalSamples()*decoder.getChannels());
          let pos = 0;
          while (!decoder.isEnd()) {
            pos += decoder.readFrame(audioData.subarray(pos, Math.min(
              (QOABase.MAX_FRAME_SAMPLES*decoder.getChannels())+pos,
              decoder.getTotalSamples()*decoder.getChannels()
            )))*decoder.getChannels();
          }

          const wav = new WaveFile();
          wav.fromScratch(decoder.getChannels(), decoder.getSampleRate(), "16", audioData);

          const wavBytes = wav.toBuffer();
          const name = inputFile.name.split(".")[0]+".wav";
          outputFiles.push({bytes: wavBytes, name});
        }
    } else { // any audio => QOA
      for (const inputFile of inputFiles) {
        const inputBytes = new Uint8Array(inputFile.bytes);
        const audioData = await this.#audioContext?.decodeAudioData(inputBytes.buffer);

        const encoder = new uint8ArrayQOAEncoder((audioData.length*audioData.numberOfChannels*4)/8+4096);
        if (!encoder.writeHeader(audioData.length, audioData.numberOfChannels, audioData.sampleRate)) {
          throw "Failed to write QOA header.";
        }

        const channelData: Float32Array[] = [];
        for (let c = 0; c < audioData.numberOfChannels; c++) {
          channelData.push(audioData.getChannelData(c));
        }

        let offset = 0;
        while (offset < audioData.length) {
          const frameSamples = Math.min(QOABase.MAX_FRAME_SAMPLES, audioData.length-offset);
          const frameBuffer = new Int16Array(frameSamples * audioData.numberOfChannels);

          let index = 0;
          for (let i = 0; i < frameSamples; i++) {
            for (let c = 0; c < audioData.numberOfChannels; c++) {
              let sample = channelData[c][offset + i];
              sample = sample < -1 ? -1 : sample > 1 ? 1 : sample;
              frameBuffer[index++] = sample < 0 ? sample * 32768 : sample * 32767;
            }
          }

          if (!encoder.writeFrame(frameBuffer, frameSamples)) {
            throw "Failed to write QOA frame.";
          }

          offset += frameSamples;
        }

        const qoaBytes = encoder.getData();
        const name = inputFile.name.split(".")[0]+".qoa";
        outputFiles.push({bytes: qoaBytes, name});
      }
    }

    return outputFiles;
  }
}

export default qoaFuHandler;
