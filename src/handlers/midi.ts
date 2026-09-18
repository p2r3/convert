import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import {
  extractEvents,
  tableToString,
  stringToTable,
  buildMidi,
  parseRtttl,
  parseGrubTune,
  tableToRtttl,
  tableToGrubTune,
  pngToMidi,
  midiToPng,
} from "./midi/midifilelib.js";

import CommonFormats, { Category } from "src/CommonFormats.ts";
import { InitializationError } from "src/errors.ts";

const SAMPLE_RATE = 44100;
const BUFFER_FRAMES = 4096;
const TAIL_CHUNKS_MAX = 100; // up to ~9s of reverb tail

// Cache the full FluidSynth init so concurrent or repeated calls share one run.
let midiInitPromise: Promise<{ JSSynth: any; sfontBin: ArrayBuffer }> | null = null;

function loadFluidSynth(): Promise<{ JSSynth: any; sfontBin: ArrayBuffer }> {
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
      const fluidModuleReady = new Promise<unknown>((r) => {
        fluidModuleResolve = r;
      });
      (globalThis as any).Module = {
        onRuntimeInitialized(this: unknown) {
          fluidModuleResolve(this);
        },
      };

      let fluidSrc = await fetch("/convert/wasm/libfluidsynth-2.4.6.js").then((r) => r.text());
      // In an ES module, "var Module" is hoisted to "undefined", shadowing globalThis.Module.
      // Patch the Emscripten init line so it reads from globalThis explicitly.
      fluidSrc = fluidSrc.replace(
        'var Module=typeof Module!="undefined"?Module:{}',
        "var Module=globalThis.Module||{}",
      );
      const blob = new Blob([fluidSrc], { type: "text/javascript" });
      const blobUrl = URL.createObjectURL(blob);
      await import(/* @vite-ignore */ blobUrl);
      URL.revokeObjectURL(blobUrl);
      const fluidModule = await fluidModuleReady;

      const JSSynth = await import("js-synthesizer");
      JSSynth.Synthesizer.initializeWithFluidSynthModule(fluidModule);
      await JSSynth.Synthesizer.waitForWasmInitialized();

      const sfontBin = await fetch("/convert/wasm/TimGM6mb.sf2").then((r) => r.arrayBuffer());
      return { JSSynth, sfontBin };
    })();
  }
  return midiInitPromise;
}

// Codec handler: text formats <-> MIDI binary (pure JS, no FluidSynth)
//
// Kept separate from midiSynthHandler so the routing graph never creates a
// direct rtttl->wav or txt->wav edge: text formats live here, wav lives only in
// midiSynthHandler.  The two-step path rtttl->mid (codec) -> wav (synth) is the
// shortest valid route.

export class midiCodecHandler implements FormatHandler {
  public name = "midiCodec";
  public supportedFormats: FileFormat[] = [];
  public ready = false;
  public offload: boolean = true;

  async init(): Promise<void> {
    this.supportedFormats.push(
      {
        name: "MIDI",
        format: "mid",
        extension: "mid",
        mime: "audio/midi",
        from: true,
        to: true,
        internal: "mid",
        category: Category.AUDIO,
        lossless: true,
      },
      {
        name: "RTTTL",
        format: "rtttl",
        extension: "rtttl",
        mime: "audio/rtttl",
        from: true,
        to: true,
        internal: "rtttl",
        category: Category.TEXT,
        lossless: false,
      },
      {
        name: "NokRing",
        format: "rtttl",
        extension: "nokring",
        mime: "audio/rtttl",
        from: true,
        to: false,
        internal: "rtttl",
        category: Category.TEXT,
        lossless: false,
      },
      {
        name: "GRUB Init Tune",
        format: "grub",
        extension: "grub",
        mime: "text/plain",
        from: true,
        to: true,
        internal: "grub",
        category: Category.TEXT,
        lossless: false,
      },
      CommonFormats.TEXT.builder("txt").allowFrom().allowTo().markLossless(),
      // PNG spectrogram -> MIDI (matches meyda's internal="image" so routing picks
      // up the audio->png->mid path automatically)
      CommonFormats.PNG.builder("png").allowFrom().allowTo(),
    );
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {
    if (!this.ready) throw new InitializationError("Handler not initialized.");
    const outputFiles: FileData[] = [];

    for (const inputFile of inputFiles) {
      const baseName = inputFile.name.replace(/\.[^.]+$/, "");

      // Step 1: input -> event table

      let table: any[];

      if (inputFormat.internal === "png") {
        // PNG spectrogram: decode pixels then extract notes
        const blob = new Blob([inputFile.bytes as BlobPart], { type: inputFormat.mime });
        const img = await createImageBitmap(blob);
        const canvas = new OffscreenCanvas(img.width, img.height);
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        table = pngToMidi(data, width, height);
      } else if (inputFormat.internal === "mid") {
        table = extractEvents(inputFile.bytes);
      } else if (
        inputFormat.internal === "txt" ||
        inputFormat.internal === "rtttl" ||
        inputFormat.internal === "grub"
      ) {
        // Text input: MIDI-text, RTTTL, or GRUB tune
        const text = new TextDecoder().decode(inputFile.bytes);
        const trimmed = text.trimStart();
        table = trimmed.startsWith("# MIDI File")
          ? stringToTable(text)
          : /^[^\s:]+\s*:(?:\s*[a-zA-Z]=\d+\s*,?\s*)+:/.test(trimmed)
            ? parseRtttl(text)
            : parseGrubTune(text);
      } else {
        throw new TypeError(`Unsupported input format: ${inputFormat.internal}`);
      }

      // Step 2: event table -> output format

      if (outputFormat.internal === "txt") {
        const text = tableToString(table);
        outputFiles.push({
          bytes: new TextEncoder().encode(text),
          name: baseName + "." + outputFormat.extension,
        });
      } else if (outputFormat.internal === "rtttl") {
        const text = tableToRtttl(table, baseName);
        outputFiles.push({
          bytes: new TextEncoder().encode(text),
          name: baseName + "." + outputFormat.extension,
        });
      } else if (outputFormat.internal === "grub") {
        const text = tableToGrubTune(table);
        outputFiles.push({
          bytes: new TextEncoder().encode(text),
          name: baseName + "." + outputFormat.extension,
        });
      } else if (outputFormat.internal === "mid") {
        const bytes = buildMidi(table);
        outputFiles.push({ bytes, name: baseName + "." + outputFormat.extension });
      } else if (outputFormat.internal === "png") {
        // Render piano roll onto a PNG using the same frequency->row mapping as pngToMidi
        const { pixels, width, height } = midiToPng(table);
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext("2d")!;
        ctx.putImageData(new ImageData(pixels as ImageDataArray, width, height), 0, 0);
        const blob = await canvas.convertToBlob({
          type: outputFormat.mime,
        });
        const bytes = new Uint8Array(await blob.arrayBuffer());
        outputFiles.push({ bytes, name: baseName + "." + outputFormat.extension });
      } else {
        throw new TypeError(`Unsupported output format: ${outputFormat.internal}`);
      }
    }

    return outputFiles;
  }
}

// Synth handler: MIDI binary -> WAV (FluidSynth)
//
// Only exposes mid (from) and wav (to).  wav is intentionally absent from
// midiCodecHandler so no direct text->wav edge is created in the routing graph.

export class midiSynthHandler implements FormatHandler {
  public name = "midiSynth";
  public supportedFormats: FileFormat[] = [];
  public ready = false;
  public offload: boolean = true;

  #sfontBin?: ArrayBuffer;
  #JSSynth?: any;

  async init(): Promise<void> {
    const { JSSynth, sfontBin } = await loadFluidSynth();
    this.#JSSynth = JSSynth;
    this.#sfontBin = sfontBin;

    this.supportedFormats.push(
      {
        name: "MIDI",
        format: "mid",
        extension: "mid",
        mime: "audio/midi",
        from: true,
        to: false,
        internal: "mid",
        category: Category.AUDIO,
        lossless: true,
      },
      CommonFormats.WAV.builder("wav").allowTo().markLossless(),
    );

    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    _inputFormat: FileFormat,
    _outputFormat: FileFormat,
  ): Promise<FileData[]> {
    if (!this.ready || !this.#sfontBin) throw new InitializationError("Handler not initialized.");

    const JSSynth = this.#JSSynth;
    const outputFiles: FileData[] = [];

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
        left.push(l);
        right.push(r);
      }

      // Render reverb/chorus tail until voices stop (or max chunks)
      for (let i = 0; i < TAIL_CHUNKS_MAX && synth.isPlaying(); i++) {
        const l = new Float32Array(BUFFER_FRAMES);
        const r = new Float32Array(BUFFER_FRAMES);
        synth.render([l, r]);
        left.push(l);
        right.push(r);
      }

      synth.close();

      // Interleave channels and clamp float32 -> int16
      const totalFrames = left.length * BUFFER_FRAMES;
      const pcm = new Int16Array(totalFrames * 2);
      let offset = 0;
      for (let i = 0; i < left.length; i++) {
        for (let j = 0; j < BUFFER_FRAMES; j++) {
          pcm[offset++] = Math.max(-32768, Math.min(32767, (left[i][j] * 32767) | 0));
          pcm[offset++] = Math.max(-32768, Math.min(32767, (right[i][j] * 32767) | 0));
        }
      }

      const wavBytes = buildWav(pcm, SAMPLE_RATE, 2, 16);
      outputFiles.push({ bytes: wavBytes, name: inputFile.name.replace(/\.[^.]+$/, "") + ".wav" });
    }

    return outputFiles;
  }
}

function buildWav(
  pcmData: Int16Array,
  sampleRate: number,
  numChannels: number,
  bitsPerSample: number,
): Uint8Array {
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
