import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

import Formats, { Category } from "src/Formats.ts";
import { InitializationError } from "src/errors.ts";
import wasmUrl from "built/libopenmpt/libopenmpt.wasm?url";
import runtimeUrl from "built/libopenmpt/libopenmpt.js?url";
import { changeExt } from "src/common/index.ts";
import { Settings } from "src/Settings.ts";
import type { ConvertContext } from "src/ui/ProgressStore.ts";

// the parts of the emscripten module we use, see libopenmpt.h for the C API
interface LibOpenMPTModule {
  HEAPU8: Uint8Array;
  HEAP16: Int16Array;
  _malloc(size: number): number;
  _free(ptr: number): void;
  _openmpt_module_create_from_memory2(
    data: number,
    size: number,
    logfunc: number,
    loguser: number,
    errfunc: number,
    erruser: number,
    error: number,
    errorMessage: number,
    ctls: number,
  ): number;
  _openmpt_module_set_repeat_count(mod: number, count: number): number;
  _openmpt_module_read_interleaved_stereo(
    mod: number,
    sampleRate: number,
    count: number,
    buffer: number,
  ): number;
  _openmpt_module_destroy(mod: number): void;
}

type LibOpenMPTFactory = (options: {
  locateFile: (path: string) => string;
}) => Promise<LibOpenMPTModule>;

const TRACKER_FORMATS: Array<{ ext: string; name: string; mime?: string }> = [
  { ext: "mptm", name: "OpenMPT Module" },
  { ext: "mod", name: "Amiga MOD", mime: "audio/x-mod" },
  { ext: "s3m", name: "Scream Tracker 3 Module", mime: "audio/x-s3m" },
  { ext: "xm", name: "FastTracker 2 Extended Module", mime: "audio/x-xm" },
  { ext: "it", name: "Impulse Tracker Module", mime: "audio/x-it" },
  { ext: "667", name: "UNIS 669 Composer Module" },
  { ext: "669", name: "UNIS 669 Composer Module" },
  { ext: "amf", name: "ASYLUM / DSMI Advanced Module Format" },
  { ext: "ams", name: "Extreme Tracker / Velvet Studio Module" },
  { ext: "c67", name: "CDFM / Composer 670 Module" },
  { ext: "cba", name: "Chuck Biscuits AmigaTracker Module" },
  { ext: "dbm", name: "DigiBooster Pro Module" },
  { ext: "digi", name: "Digital Tracker Module" },
  { ext: "dmf", name: "X-Tracker Module" },
  { ext: "dsm", name: "DSIK Module" },
  { ext: "dsym", name: "Digital Symphony Module" },
  { ext: "dtm", name: "Digital Tracker Module" },
  { ext: "etx", name: "Estrayk Tracker Module" },
  { ext: "far", name: "Farandole Composer Module" },
  { ext: "fc", name: "Future Composer Module" },
  { ext: "fc13", name: "Future Composer 1.3 Module" },
  { ext: "fc14", name: "Future Composer 1.4 Module" },
  { ext: "fmt", name: "FM Tracker Module" },
  { ext: "fst", name: "Future Composer BSI Module" },
  { ext: "ftm", name: "Face The Music Module" },
  { ext: "gdm", name: "General Digital Music Module" },
  { ext: "gmc", name: "Game Music Creator Module" },
  { ext: "gtk", name: "Graoumf Tracker Module" },
  { ext: "gt2", name: "Graoumf Tracker 2 Module" },
  { ext: "ice", name: "Imago Orpheus Module" },
  { ext: "imf", name: "Imago Orpheus Module" },
  { ext: "ims", name: "Images Music System Module" },
  { ext: "j2b", name: "GALAXY Music System / Jazz Jackrabbit 2 Module" },
  { ext: "m15", name: "Ultimate Soundtracker Module" },
  { ext: "mdl", name: "DigiTrakker Module" },
  { ext: "med", name: "OctaMED Module" },
  { ext: "mmcmp", name: "Memory Music Compression Module" },
  { ext: "mms", name: "MultiMedia Sound Module" },
  { ext: "mo3", name: "MO3 Module", mime: "audio/x-mo3" },
  { ext: "mt2", name: "MadTracker 2 Module" },
  { ext: "mtm", name: "MultiTracker Module" },
  { ext: "mus", name: "Doom / Heretic / Hexen MUS Module" },
  { ext: "nst", name: "NoiseTracker Module" },
  { ext: "okt", name: "Oktalyzer Module" },
  { ext: "oxm", name: "OpenXM Module" },
  { ext: "plm", name: "Disorder Tracker 2 Module" },
  { ext: "psm", name: "Protracker Studio Module" },
  { ext: "pt36", name: "Protracker 3.6 Module" },
  { ext: "ptm", name: "PolyTracker Module" },
  { ext: "puma", name: "Puma Tracker Module" },
  { ext: "ppm", name: "Disorder Tracker Module" },
  { ext: "rtm", name: "Real Tracker Module" },
  { ext: "sfx", name: "SoundFX Module" },
  { ext: "sfx2", name: "SoundFX 2 Module" },
  { ext: "smod", name: "Soundtracker Module" },
  { ext: "st26", name: "Soundtracker 2.6 Module" },
  { ext: "stk", name: "Soundtracker Module" },
  { ext: "stm", name: "Scream Tracker 2 Module" },
  { ext: "stx", name: "Scream Tracker Music Interface Kit" },
  { ext: "stp", name: "Soundtracker Pro II Module" },
  { ext: "symmod", name: "Symphonie Module" },
  { ext: "tcb", name: "TC Browser Module" },
  { ext: "ult", name: "UltraTracker Module" },
  { ext: "umx", name: "Unreal Music Package" },
  { ext: "unic", name: "UNIC Tracker Module" },
  { ext: "wow", name: "Grave Composer Module" },
  { ext: "xmf", name: "Extensible Music Format" },
  { ext: "xpk", name: "XPKF/SQSH Compressed Module" },
];

const SAMPLE_RATE = 48000;

class libopenmptHandler implements FormatHandler {
  public readonly name = "libopenmpt";
  public supportedFormats: FileFormat[] = [];
  public ready = false;

  #module?: LibOpenMPTModule;

  async init(): Promise<void> {
    const { default: createModule }: { default: LibOpenMPTFactory } = await import(
      /* @vite-ignore */ runtimeUrl
    );
    this.#module = await createModule({ locateFile: () => wasmUrl });

    this.supportedFormats = [];
    for (const fmt of TRACKER_FORMATS) {
      this.supportedFormats.push({
        name: fmt.name,
        format: fmt.ext,
        extension: fmt.ext,
        mime: fmt.mime ?? `audio/x-${fmt.ext}`,
        from: true,
        to: false,
        internal: fmt.ext,
        category: Category.AUDIO,
        lossless: true,
      });
    }

    this.supportedFormats.push(
      Formats.WAV.builder("wav")
        .lossless()
        .options({ sampleRate: { ...Settings.sampleRate, min: 8000, max: 192000 } })
        .to(),
    );

    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    _inputFormat: FileFormat,
    _outputFormat: FileFormat,
    ctx?: ConvertContext,
  ): Promise<FileData[]> {
    if (!this.ready || !this.#module) throw new InitializationError("Handler not initialized.");
    const sampleRate = ctx?.options.sampleRate ?? SAMPLE_RATE;

    const mod = this.#module;
    const outputFiles: FileData[] = [];

    for (const inputFile of inputFiles) {
      const bytes = new Uint8Array(inputFile.bytes);
      const pcmData = render(mod, bytes, sampleRate);
      const wavBytes = buildWav(pcmData, sampleRate, 2, 16);
      const name = changeExt(inputFile.name, "wav");
      outputFiles.push({ bytes: wavBytes, name });
    }

    return outputFiles;
  }
}

const RENDER_FRAMES = 4096;

/** Renders a whole module to interleaved stereo 16-bit PCM. */
function render(mod: LibOpenMPTModule, fileData: Uint8Array, sampleRate: number): Int16Array {
  const input = mod._malloc(fileData.length);
  mod.HEAPU8.set(fileData, input);
  const handle = mod._openmpt_module_create_from_memory2(
    input,
    fileData.length,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
  );
  mod._free(input);
  if (!handle) throw new Error("libopenmpt: failed to open module");

  const buffer = mod._malloc(RENDER_FRAMES * 4);
  const chunks: Int16Array[] = [];
  let total = 0;
  try {
    mod._openmpt_module_set_repeat_count(handle, 0);
    let frames: number;
    do {
      frames = mod._openmpt_module_read_interleaved_stereo(
        handle,
        sampleRate,
        RENDER_FRAMES,
        buffer,
      );
      // HEAP16 can be replaced when memory grows, so read it fresh each time
      const start = buffer >> 1;
      chunks.push(mod.HEAP16.slice(start, start + frames * 2));
      total += frames;
    } while (frames > 0);
  } finally {
    mod._free(buffer);
    mod._openmpt_module_destroy(handle);
  }

  const out = new Int16Array(total * 2);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
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

export default libopenmptHandler;
