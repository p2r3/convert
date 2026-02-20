import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import { extractEvents, tableToString, stringToTable, buildMidi, parseGrubTune } from "./midi/midifilelib.js";

const SAMPLE_RATE = 44100;
const BUFFER_FRAMES = 4096;
const TAIL_CHUNKS_MAX = 100; // up to ~9s of reverb tail

// Cache script-load promises so each URL is only ever loaded once.
// Classic scripts use `let` at the top level, which cannot be redeclared
// if the same script tag is inserted twice.
const scriptCache = new Map<string, Promise<void>>();
function loadScript(src: string): Promise<void> {
  if (scriptCache.has(src)) return scriptCache.get(src)!;
  const p = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
  scriptCache.set(src, p);
  return p;
}

// Cache the full init so concurrent or repeated init() calls share one run.
let midiInitPromise: Promise<{ JSSynth: any; sfontBin: ArrayBuffer }> | null = null;

class midiHandler implements FormatHandler {
  public name = "midi";
  public supportedFormats: FileFormat[] = [];
  public ready = false;

  #sfontBin?: ArrayBuffer;
  #JSSynth?: any;

  async init(): Promise<void> {
    if (!midiInitPromise) {
      midiInitPromise = (async () => {
        // libfluidsynth-2.4.6.js and libopenmpt.js both declare "class ExceptionInfo"
        // at the top level of a classic <script>. Top-level class declarations behave
        // like let so redeclaring one in the same global scope throws a SyntaxError.
        // Fix: fetch libfluidsynth content and import it via a Blob URL as an ES module.
        // Module-scoped class declarations dont pollute the global scope.
        //
        // The Emscripten init pattern still works because modules have access to the
        // global scope chain, so "typeof Module != 'undefined'" finds globalThis.Module.
        let fluidModuleResolve!: (mod: unknown) => void;
        const fluidModuleReady = new Promise<unknown>(r => { fluidModuleResolve = r; });
        (globalThis as any).Module = {
          onRuntimeInitialized(this: unknown) { fluidModuleResolve(this); }
        };

        let fluidSrc = await fetch("/convert/wasm/libfluidsynth-2.4.6.js").then(r => r.text());
        // In an ES module, "var Module" is hoisted to "undefined", shadowing globalThis.Module.
        // Patch the Emscripten init line so it reads from globalThis explicitly.
        fluidSrc = fluidSrc.replace(
          'var Module=typeof Module!="undefined"?Module:{}',
          'var Module=globalThis.Module||{}'
        );
        const blob = new Blob([fluidSrc], { type: "text/javascript" });
        const blobUrl = URL.createObjectURL(blob);
        await import(/* @vite-ignore */ blobUrl);
        URL.revokeObjectURL(blobUrl);
        const fluidModule = await fluidModuleReady;

        await loadScript("/convert/wasm/js-synthesizer.js");

        const JSSynth = (globalThis as any).JSSynth;
        JSSynth.Synthesizer.initializeWithFluidSynthModule(fluidModule);
        await JSSynth.Synthesizer.waitForWasmInitialized();

        const sfontBin = await fetch("/convert/wasm/TimGM6mb.sf2").then(r => r.arrayBuffer());
        return { JSSynth, sfontBin };
      })();
    }

    const { JSSynth, sfontBin } = await midiInitPromise;
    this.#JSSynth = JSSynth;
    this.#sfontBin = sfontBin;

    this.supportedFormats.push(
      { name: "MIDI",          format: "mid",  extension: "mid",  mime: "audio/midi",   from: true,  to: true,  internal: "mid",  category: "audio", lossless: true },
      { name: "MIDI",          format: "midi", extension: "midi", mime: "audio/x-midi", from: true,  to: false, internal: "midi", category: "audio", lossless: true },
      { name: "Waveform Audio", format: "wav", extension: "wav",  mime: "audio/wav",    from: false, to: true,  internal: "wav",  category: "audio", lossless: true },
      { name: "Plain Text",    format: "txt", extension: "txt",  mime: "text/plain",   from: true,  to: true,  internal: "txt",  category: "text",  lossless: true },
    );

    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    _inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {
    if (!this.ready || !this.#sfontBin) throw "Handler not initialized.";

    const JSSynth = this.#JSSynth;
    const outputFiles: FileData[] = [];

    if (outputFormat.internal === "txt") {
      for (const inputFile of inputFiles) {
        const table = extractEvents(inputFile.bytes);
        const text  = tableToString(table);
        const bytes = new TextEncoder().encode(text);
        outputFiles.push({ bytes, name: inputFile.name.replace(/\.[^.]+$/, "") + ".txt" });
      }
      return outputFiles;
    }

    if (outputFormat.internal === "mid" || outputFormat.internal === "midi") {
      const ext = outputFormat.extension;
      for (const inputFile of inputFiles) {
        const text  = new TextDecoder().decode(inputFile.bytes);
        const table = text.trimStart().startsWith("# MIDI File")
          ? stringToTable(text)
          : parseGrubTune(text);
        const bytes = buildMidi(table);
        outputFiles.push({ bytes, name: inputFile.name.replace(/\.[^.]+$/, "") + "." + ext });
      }
      return outputFiles;
    }

    for (const inputFile of inputFiles) {
      const synth = new JSSynth.Synthesizer();
      synth.init(SAMPLE_RATE);
      await synth.loadSFont(this.#sfontBin);

      // slice() guarantees a clean ArrayBuffer with no byteOffset
      const midiBin: ArrayBuffer = inputFile.bytes.slice().buffer;
      await synth.addSMFDataToPlayer(midiBin);
      await synth.playPlayer();

      const left: Float32Array[] = [];
      const right: Float32Array[] = [];

      // Render while player is active
      while (synth.isPlayerPlaying()) {
        const l = new Float32Array(BUFFER_FRAMES);
        const r = new Float32Array(BUFFER_FRAMES);
        synth.render([l, r]);
        left.push(l); right.push(r);
      }

      // Render reverb/chorus tail until voices stop (or max chunks)
      for (let i = 0; i < TAIL_CHUNKS_MAX && synth.isPlaying(); i++) {
        const l = new Float32Array(BUFFER_FRAMES);
        const r = new Float32Array(BUFFER_FRAMES);
        synth.render([l, r]);
        left.push(l); right.push(r);
      }

      synth.close();

      // Interleave channels and clamp float32 -> int16
      const totalFrames = left.length * BUFFER_FRAMES;
      const pcm = new Int16Array(totalFrames * 2);
      let offset = 0;
      for (let i = 0; i < left.length; i++) {
        for (let j = 0; j < BUFFER_FRAMES; j++) {
          pcm[offset++] = Math.max(-32768, Math.min(32767, left[i][j]  * 32767 | 0));
          pcm[offset++] = Math.max(-32768, Math.min(32767, right[i][j] * 32767 | 0));
        }
      }

      const wavBytes = buildWav(pcm, SAMPLE_RATE, 2, 16);
      outputFiles.push({ bytes: wavBytes, name: inputFile.name.replace(/\.[^.]+$/, "") + ".wav" });
    }

    return outputFiles;
  }
}

function buildWav(pcmData: Int16Array, sampleRate: number, numChannels: number, bitsPerSample: number): Uint8Array {
  const bytesPerSample = bitsPerSample / 8;
  const dataSize = pcmData.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  new Int16Array(buffer, 44).set(pcmData);

  return new Uint8Array(buffer);
}

export default midiHandler;
