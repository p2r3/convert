import Formats from "src/Formats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import { SimpleTTS } from "built/espeakng.js/js/espeakng-simple.js";
import { WaveFile } from "wavefile";
import type { TypedWaveFile } from "src/common/wav.ts";
import { changeExt, decode } from "src/common/index.ts";
import type { ConvertContext } from "src/ui/ProgressStore.ts";

// voice files bundled into espeakng.worker.data, minus the mbrola ones
// oxfmt-ignore
const VOICES = [
  "af", "am", "an", "ar", "as", "az", "bg", "bn", "bs", "ca", "cmn", "cs", "cy", "da", "de", "el",
  "en", "en-029", "en-GB-scotland", "en-GB-x-gbclan", "en-GB-x-gbcwmd", "en-GB-x-rp", "en-US",
  "eo", "es", "es-419", "et", "eu", "fa", "fa-Latn", "fi", "fr", "fr-BE", "ga", "gd", "gn", "grc",
  "gu", "hi", "hr", "hu", "hy", "hy-arevmda", "ia", "id", "is", "it", "jbo", "jp", "ka", "kl",
  "kn", "ko", "ku", "ky", "la", "lfn", "lt", "lv", "mk", "ml", "mr", "ms", "mt", "my", "nci",
  "ne", "nl", "no", "om", "or", "pa", "pap", "pl", "pt-BR", "pt-PT", "ro", "ru", "si", "sk", "sl",
  "sq", "sr", "sv", "sw", "ta", "te", "tn", "tr", "tt", "ur", "vi", "vi-VN-x-central",
  "vi-VN-x-south", "yue",
];

// Playback is sped up by this much to raise the pitch, see doConvert
const PLAYBACK_RATE = 1.4;
const DEFAULT_RATE = 220;

// the bundled typings leave out speak's options argument
type Speak = (
  text: string,
  options: { voice?: string; rate?: number; pitch?: number },
  callback: (audio: Float32Array, sampleRate: number) => void,
) => void;

export class espeakngHandler implements FormatHandler {
  public readonly name = "espeakng";
  public supportedFormats = [
    Formats.TEXT.builder("text").from(),
    Formats.WAV.builder("wav")
      .options({
        voice: { type: "enum", category: "audio", label: "Voice", values: VOICES },
        speed: {
          type: "number",
          category: "audio",
          label: "Speed",
          unit: "wpm",
          min: Math.ceil(80 * PLAYBACK_RATE),
          max: Math.floor(450 * PLAYBACK_RATE),
          integer: true,
        },
        pitch: {
          type: "number",
          category: "audio",
          label: "Pitch",
          min: 0,
          max: 99,
          integer: true,
        },
      })
      .to(),
  ];
  public ready = false;
  #tts: SimpleTTS | undefined = undefined;

  async init() {
    this.ready = true;
  }

  // here so we lazy load the TTS instead of waiting for it in `init`
  async getTTS(): Promise<SimpleTTS> {
    if (this.#tts == undefined) {
      await new Promise<void>((resolve) => {
        this.#tts = new SimpleTTS({
          workerPath: new URL("external/espeakng.js/espeakng.worker.js", globalThis.baseUrl).href,
          defaultVoice: "en",
          defaultRate: DEFAULT_RATE,
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
    ctx?: ConvertContext,
  ): Promise<FileData[]> {
    const tts = await this.getTTS();
    const speak = tts.speak.bind(tts) as unknown as Speak;
    const { voice, speed, pitch } = ctx?.options ?? {};
    const speakOptions = {
      voice: voice as string | undefined,
      rate: speed === undefined ? undefined : Math.round((speed as number) / PLAYBACK_RATE),
      pitch: pitch as number | undefined,
    };
    return Promise.all(
      inputFiles.map(async (file) => {
        const [samples, sampleRate] = await new Promise<[Float32Array, number]>((resolve) => {
          speak(decode(file.bytes), speakOptions, (audio, sampleRate) => {
            resolve([audio, sampleRate]);
          });
        });
        const wav = new WaveFile() as TypedWaveFile;
        // Increasing pitch doesn't seem to do anything, so instead we
        // decrease playback rate and increase playback sample rate
        wav.fromScratch(1, sampleRate * PLAYBACK_RATE, "32f", samples);
        return {
          name: changeExt(file.name, "wav"),
          bytes: wav.toBuffer(),
        };
      }),
    );
  }
}

export default espeakngHandler;
