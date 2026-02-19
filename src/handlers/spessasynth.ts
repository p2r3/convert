import CommonFormats from "src/CommonFormats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import { audioToWav, BasicMIDI, SoundBankLoader, SpessaSynthProcessor, SpessaSynthSequencer } from "spessasynth_core";

const sampleRate = 44100;

// the following page was heavily referenced: https://spessasus.github.io/spessasynth_core/getting-started/#midi-to-wav-converter
// (i.e. I stole all of the code from there)

export class spessasynthHandler implements FormatHandler {
  public name: string = "spessasynth";
  public ready: boolean = true;

  public supportedFormats: FileFormat[] = [
    {
      name: "Musical Instrument Digital Interface",
      format: "midi",
      extension: "mid",
      mime: "audio/midi",
      from: true,
      to: false,
      internal: "mid"
    },
    CommonFormats.WAV.supported("wav", false, true)
  ];

  async init() {
    this.ready = true;
  }

  #synth: SpessaSynthProcessor | undefined
  async getSynth(): Promise<SpessaSynthProcessor> {
    if(this.#synth == undefined) {
      this.#synth = new SpessaSynthProcessor(sampleRate, {
        enableEventSystem: false,
        enableEffects: false
      });
      this.#synth.soundBankManager.addSoundBank(
        SoundBankLoader.fromArrayBuffer(await (await fetch("./assets/GeneralUser-GS.sf2")).arrayBuffer()),
        "main"
      );
      await this.#synth.processorInitialized;
    }
    return this.#synth!;
  }

  async doConvert (
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {
    const synth = await this.getSynth();
    return await Promise.all(inputFiles.map(async(file) => {
      // TODO: this could lag the browser
      const midi = BasicMIDI.fromArrayBuffer(file.bytes.buffer as ArrayBuffer)
      const sampleCount = Math.ceil(sampleRate * (midi.duration + 2));
      const seq = new SpessaSynthSequencer(synth);
      seq.loadNewSongList([midi]);
      seq.play();
      const outLeft = new Float32Array(sampleCount), outRight = new Float32Array(sampleCount);
      const start = performance.now();
      let filledSamples = 0;
      const BUFFER_SIZE = 128;
      const durationRounded = Math.floor(seq.midiData!.duration * 100) / 100;
      const outputArray = [outLeft, outRight];
      while (filledSamples < sampleCount) {
        // Process sequencer
        seq.processTick();
        // Render
        const bufferSize = Math.min(BUFFER_SIZE, sampleCount - filledSamples);
        synth.renderAudio(outputArray, [], [], filledSamples, bufferSize);
        filledSamples += bufferSize;
      }
      return {
        name: file.name.split(".")[0]+".wav",
        bytes: new Uint8Array(audioToWav([outLeft, outRight], sampleRate))
      }
    }))
  }
}

export default spessasynthHandler;
