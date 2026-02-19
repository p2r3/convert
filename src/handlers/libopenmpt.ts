import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

interface LibOpenMPTModule {
  __render(fileData: Uint8Array, sampleRate: number): Int16Array;
}

const TRACKER_FORMATS: Array<{ ext: string; name: string; mime?: string }> = [
  { ext: "mptm", name: "OpenMPT Module" },
  { ext: "mod",  name: "Amiga MOD",                                   mime: "audio/x-mod" },
  { ext: "s3m",  name: "Scream Tracker 3 Module",                     mime: "audio/x-s3m" },
  { ext: "xm",   name: "FastTracker 2 Extended Module",               mime: "audio/x-xm"  },
  { ext: "it",   name: "Impulse Tracker Module",                      mime: "audio/x-it"  },
  { ext: "667",  name: "UNIS 669 Composer Module" },
  { ext: "669",  name: "UNIS 669 Composer Module" },
  { ext: "amf",  name: "ASYLUM / DSMI Advanced Module Format" },
  { ext: "ams",  name: "Extreme Tracker / Velvet Studio Module" },
  { ext: "c67",  name: "CDFM / Composer 670 Module" },
  { ext: "cba",  name: "Chuck Biscuits AmigaTracker Module" },
  { ext: "dbm",  name: "DigiBooster Pro Module" },
  { ext: "digi", name: "Digital Tracker Module" },
  { ext: "dmf",  name: "X-Tracker Module" },
  { ext: "dsm",  name: "DSIK Module" },
  { ext: "dsym", name: "Digital Symphony Module" },
  { ext: "dtm",  name: "Digital Tracker Module" },
  { ext: "etx",  name: "Estrayk Tracker Module" },
  { ext: "far",  name: "Farandole Composer Module" },
  { ext: "fc",   name: "Future Composer Module" },
  { ext: "fc13", name: "Future Composer 1.3 Module" },
  { ext: "fc14", name: "Future Composer 1.4 Module" },
  { ext: "fmt",  name: "FM Tracker Module" },
  { ext: "fst",  name: "Future Composer BSI Module" },
  { ext: "ftm",  name: "Face The Music Module" },
  { ext: "gdm",  name: "General Digital Music Module" },
  { ext: "gmc",  name: "Game Music Creator Module" },
  { ext: "gtk",  name: "Graoumf Tracker Module" },
  { ext: "gt2",  name: "Graoumf Tracker 2 Module" },
  { ext: "ice",  name: "Imago Orpheus Module" },
  { ext: "imf",  name: "Imago Orpheus Module" },
  { ext: "ims",  name: "Images Music System Module" },
  { ext: "j2b",  name: "GALAXY Music System / Jazz Jackrabbit 2 Module" },
  { ext: "m15",  name: "Ultimate Soundtracker Module" },
  { ext: "mdl",  name: "DigiTrakker Module" },
  { ext: "med",  name: "OctaMED Module" },
  { ext: "mmcmp",name: "Memory Music Compression Module" },
  { ext: "mms",  name: "MultiMedia Sound Module" },
  { ext: "mo3",  name: "MO3 Module",                                  mime: "audio/x-mo3" },
  { ext: "mt2",  name: "MadTracker 2 Module" },
  { ext: "mtm",  name: "MultiTracker Module" },
  { ext: "mus",  name: "Doom / Heretic / Hexen MUS Module" },
  { ext: "nst",  name: "NoiseTracker Module" },
  { ext: "okt",  name: "Oktalyzer Module" },
  { ext: "oxm",  name: "OpenXM Module" },
  { ext: "plm",  name: "Disorder Tracker 2 Module" },
  { ext: "psm",  name: "Protracker Studio Module" },
  { ext: "pt36", name: "Protracker 3.6 Module" },
  { ext: "ptm",  name: "PolyTracker Module" },
  { ext: "puma", name: "Puma Tracker Module" },
  { ext: "ppm",  name: "Disorder Tracker Module" },
  { ext: "rtm",  name: "Real Tracker Module" },
  { ext: "sfx",  name: "SoundFX Module" },
  { ext: "sfx2", name: "SoundFX 2 Module" },
  { ext: "smod", name: "Soundtracker Module" },
  { ext: "st26", name: "Soundtracker 2.6 Module" },
  { ext: "stk",  name: "Soundtracker Module" },
  { ext: "stm",  name: "Scream Tracker 2 Module" },
  { ext: "stx",  name: "Scream Tracker Music Interface Kit" },
  { ext: "stp",  name: "Soundtracker Pro II Module" },
  { ext: "symmod",name: "Symphonie Module" },
  { ext: "tcb",  name: "TC Browser Module" },
  { ext: "ult",  name: "UltraTracker Module" },
  { ext: "umx",  name: "Unreal Music Package" },
  { ext: "unic", name: "UNIC Tracker Module" },
  { ext: "wow",  name: "Grave Composer Module" },
  { ext: "xmf",  name: "Extensible Music Format" },
  { ext: "xpk",  name: "XPKF/SQSH Compressed Module" },
];

const SAMPLE_RATE = 48000;

class libopenmptHandler implements FormatHandler {

  public name: string = "libopenmpt";
  public supportedFormats: FileFormat[] = [];
  public ready: boolean = false;

  #module?: LibOpenMPTModule;

  async init (): Promise<void> {
    // Pre-fetch the WASM binary so the Emscripten module can use it directly.
    const wasmBinary = await fetch("/convert/wasm/libopenmpt.wasm")
      .then(r => r.arrayBuffer());

    // Set the global that Emscripten picks up:
    //   var Module = typeof libopenmpt != "undefined" ? libopenmpt : {}
    // libopenmpt.js was patched to attach __readyPromise (resolves with Module)
    // and __render (uses closure-scoped HEAPU8/HEAP16) before calling run().
    (globalThis as any).libopenmpt = { wasmBinary };

    // Load as a classic <script> tag so it is never run through Rollup/Vite's
    // module pipeline (which would break the Emscripten global-variable pattern).
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/convert/wasm/libopenmpt.js";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load libopenmpt.js"));
      document.head.appendChild(script);
    });

    // __readyPromise was attached by our libopenmpt.js patch and resolves with
    // the Module object once onRuntimeInitialized fires.
    this.#module = await (globalThis as any).libopenmpt.__readyPromise;

    for (const fmt of TRACKER_FORMATS) {
      this.supportedFormats.push({
        name: fmt.name,
        format: fmt.ext,
        extension: fmt.ext,
        mime: fmt.mime ?? `audio/x-${fmt.ext}`,
        from: true,
        to: false,
        internal: fmt.ext,
        category: "audio",
        lossless: true
      });
    }

    this.supportedFormats.push({
      name: "Waveform Audio File Format",
      format: "wav",
      extension: "wav",
      mime: "audio/wav",
      from: false,
      to: true,
      internal: "wav",
      category: "audio",
      lossless: true
    });

    this.ready = true;
  }

  async doConvert (
    inputFiles: FileData[],
    _inputFormat: FileFormat,
    _outputFormat: FileFormat
  ): Promise<FileData[]> {
    if (!this.ready || !this.#module) throw "Handler not initialized.";

    const mod = this.#module;
    const outputFiles: FileData[] = [];

    for (const inputFile of inputFiles) {
      const bytes = new Uint8Array(inputFile.bytes);
      const pcmData = mod.__render(bytes, SAMPLE_RATE);
      const wavBytes = buildWav(pcmData, SAMPLE_RATE, 2, 16);
      const name = inputFile.name.replace(/\.[^.]+$/, "") + ".wav";
      outputFiles.push({ bytes: wavBytes, name });
    }

    return outputFiles;
  }

}

function buildWav (pcmData: Int16Array, sampleRate: number, numChannels: number, bitsPerSample: number): Uint8Array {
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
  view.setUint16(20, 1, true);  // PCM
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
