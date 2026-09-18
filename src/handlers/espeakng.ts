import CommonFormats from "src/CommonFormats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import { SimpleTTS } from "./espeakng.js/js/espeakng-simple.js";
import { WaveFile } from "wavefile";

export class espeakngHandler implements FormatHandler {
  public name: string = "espeakng";
  public ready: boolean = true;
  public offload: boolean = true;
  #tts: SimpleTTS | undefined = undefined;

  public supportedFormats: FileFormat[] = [
    CommonFormats.TEXT.supported("text", true, false),
    CommonFormats.WAV.supported("wav", false, true),
  ];

  async init() {
    this.ready = true;
  }

  // here so we lazy load the TTS instead of waiting for it in `init`
  async getTTS(): Promise<SimpleTTS> {
    if (this.#tts == undefined) {
      await new Promise<void>((resolve) => {
        this.#tts = new SimpleTTS({
          workerPath: "/convert/js/espeakng.worker.js",
          defaultVoice: "en",
          defaultRate: 220,
          defaultPitch: 200,
          enhanceAudio: true,
        });
        this.#tts.onReady(() => {
          resolve();
        });
      });
    }
    return this.#tts!;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {
    const tts = await this.getTTS();
    return Promise.all(
      inputFiles.map(async (file) => {
        const [samples, sampleRate] = await new Promise<[Float32Array, number]>((resolve) => {
          tts.speak(
            new TextDecoder().decode(file.bytes),
            (audio: Float32Array, sampleRate: number) => {
              resolve([audio, sampleRate]);
            },
          );
        });
        const wav = new WaveFile();
        // Increasing pitch doesn't seem to do anything, so instead we
        // decrease playback rate and increase playback sample rate
        wav.fromScratch(1, sampleRate * 1.4, "32f", samples);
        return {
          name: file.name.split(".").slice(0, -1).join(".") + ".wav",
          bytes: wav.toBuffer(),
        };
      }),
    );
  }
}

export default espeakngHandler;
