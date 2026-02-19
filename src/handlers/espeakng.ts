import CommonFormats from "src/CommonFormats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import { SimpleTTS } from "./espeakng.js/js/espeakng-simple.js";


export class espeakngHandler implements FormatHandler {
  public name: string = "espeakng";
  public ready: boolean = true;
  #tts: SimpleTTS | undefined = undefined;

  public supportedFormats: FileFormat[] = [
    CommonFormats.TEXT.supported("text", true, false),
    CommonFormats.WAV.supported("wav", false, true)
  ];

  async init() {
    this.ready = true;
  }

  // here so we lazy load the TTS instead of waiting for it in `init`
  async getTTS(): Promise<SimpleTTS> {
    if(this.#tts == undefined) {
      await new Promise<void>(resolve => {
        this.#tts = new SimpleTTS({
          defaultVoice: "en",
          defaultRate: 350,
          defaultPitch: 200,
          enhanceAudio: true
        });
        this.#tts.onReady(() => {
          resolve();
        })
      });
    }
    return this.#tts!;
  }

  async doConvert (
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {
    const tts = await this.getTTS();
    return Promise.all(inputFiles.map(async(file) => {
      const audio = await new Promise<AudioBuffer>(resolve => {
        tts.speak(new TextDecoder().decode(file.bytes), (audio: Float32Array, sampleRate: number) => {
          resolve(SimpleTTS.createAudioBuffer(audio, tts.sampleRate) as AudioBuffer);
        })
      });
      return {
        name: file.name.split(".")[0]+".wav",
        bytes: new Uint8Array(audioBufferToWav(audio))
      }
    }))
  }
}

// below code taken from https://github.com/Experience-Monks/audiobuffer-to-wav/blob/master/index.js
//
// changes: type annotations were added, local-scoped functions, var → let
function audioBufferToWav (buffer: AudioBuffer, opt: { float32?: boolean } = {}): ArrayBuffer {
  function writeString (view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i))
    }
  }

  function interleave (inputL: Float32Array, inputR: Float32Array): Float32Array {
    let length = inputL.length + inputR.length
    let result = new Float32Array(length)

    let index = 0
    let inputIndex = 0

    while (index < length) {
      result[index++] = inputL[inputIndex]
      result[index++] = inputR[inputIndex]
      inputIndex++
    }
    return result
  }

  function writeFloat32 (output: DataView, offset: number, input: Float32Array) {
    for (let i = 0; i < input.length; i++, offset += 4) {
      output.setFloat32(offset, input[i], true)
    }
  }

  function floatTo16BitPCM (output: DataView, offset: number, input: Float32Array) {
    for (let i = 0; i < input.length; i++, offset += 2) {
      let s = Math.max(-1, Math.min(1, input[i]))
      output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
    }
  }
  function encodeWAV (samples: Float32Array, format: number, sampleRate: number, numChannels: number, bitDepth: number): ArrayBuffer {
    let bytesPerSample = bitDepth / 8
    let blockAlign = numChannels * bytesPerSample

    let buffer = new ArrayBuffer(44 + samples.length * bytesPerSample)
    let view = new DataView(buffer)

    /* RIFF identifier */
    writeString(view, 0, 'RIFF')
    /* RIFF chunk length */
    view.setUint32(4, 36 + samples.length * bytesPerSample, true)
    /* RIFF type */
    writeString(view, 8, 'WAVE')
    /* format chunk identifier */
    writeString(view, 12, 'fmt ')
    /* format chunk length */
    view.setUint32(16, 16, true)
    /* sample format (raw) */
    view.setUint16(20, format, true)
    /* channel count */
    view.setUint16(22, numChannels, true)
    /* sample rate */
    view.setUint32(24, sampleRate, true)
    /* byte rate (sample rate * block align) */
    view.setUint32(28, sampleRate * blockAlign, true)
    /* block align (channel count * bytes per sample) */
    view.setUint16(32, blockAlign, true)
    /* bits per sample */
    view.setUint16(34, bitDepth, true)
    /* data chunk identifier */
    writeString(view, 36, 'data')
    /* data chunk length */
    view.setUint32(40, samples.length * bytesPerSample, true)
    if (format === 1) { // Raw PCM
      floatTo16BitPCM(view, 44, samples)
    } else {
      writeFloat32(view, 44, samples)
    }

    return buffer
  }

  let numChannels = buffer.numberOfChannels
  let sampleRate = buffer.sampleRate
  let format = opt.float32 ? 3 : 1
  let bitDepth = format === 3 ? 32 : 16

  let result: Float32Array
  if (numChannels === 2) {
    result = interleave(buffer.getChannelData(0), buffer.getChannelData(1))
  } else {
    result = buffer.getChannelData(0)
  }

  return encodeWAV(result, format, sampleRate, numChannels, bitDepth)
}

export default espeakngHandler;
