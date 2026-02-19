import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import normalizeMimeType from "../normalizeMimeType.ts";

import { FFmpeg } from "@ffmpeg/ffmpeg";

function interleaveAudioBuffer(buffer: AudioBuffer): Float32Array {
  const { numberOfChannels, length } = buffer;
  const out = new Float32Array(length * numberOfChannels);
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numberOfChannels; ch++) {
      out[i * numberOfChannels + ch] = buffer.getChannelData(ch)[i];
    }
  }
  return out;
}

function floatTo16BitPCM(float32: Float32Array): Uint8Array {
  const buffer = new ArrayBuffer(float32.length * 2);
  const view = new DataView(buffer);
  let offset = 0;
  for (let i = 0; i < float32.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, float32[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buffer);
}

function writeWavHeader(
  samples: Uint8Array,
  sampleRate: number,
  channels: number,
  bitsPerSample: number,
) {
  const blockAlign = channels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const buffer = new ArrayBuffer(44 + samples.length);
  const view = new DataView(buffer);
  let p = 0;
  function writeString(s: string) {
    for (let i = 0; i < s.length; i++) view.setUint8(p++, s.charCodeAt(i));
  }
  writeString("RIFF");
  view.setUint32(p, 36 + samples.length, true);
  p += 4;
  writeString("WAVE");
  writeString("fmt ");
  view.setUint32(p, 16, true);
  p += 4; // Subchunk1Size
  view.setUint16(p, 1, true);
  p += 2; // PCM
  view.setUint16(p, channels, true);
  p += 2;
  view.setUint32(p, sampleRate, true);
  p += 4;
  view.setUint32(p, byteRate, true);
  p += 4;
  view.setUint16(p, blockAlign, true);
  p += 2;
  view.setUint16(p, bitsPerSample, true);
  p += 2;
  writeString("data");
  view.setUint32(p, samples.length, true);
  p += 4;
  // copy samples
  const outU8 = new Uint8Array(buffer);
  outU8.set(samples, 44);
  return outU8;
}

async function decodeWithBrowser(
  bytes: Uint8Array,
): Promise<{ samples: Float32Array; sampleRate: number; channels: number }> {
  if (
    typeof AudioContext === "undefined" &&
    typeof (window as any)?.AudioContext === "undefined"
  ) {
    throw new Error("AudioContext not available");
  }
  const audioCtx = new (globalThis as any).AudioContext();
  try {
    const ab = await audioCtx.decodeAudioData(bytes.buffer.slice(0));
    const samples = interleaveAudioBuffer(ab);
    const sampleRate = ab.sampleRate;
    const channels = ab.numberOfChannels;
    await audioCtx.close();
    return { samples, sampleRate, channels };
  } catch (e) {
    try {
      await audioCtx.close();
    } catch (_) {}
    throw e;
  }
}

async function decodeWithFFmpeg(
  bytes: Uint8Array,
): Promise<{ samples: Float32Array; sampleRate: number; channels: number }> {
  const ffmpeg = new FFmpeg();
  await ffmpeg.load({ coreURL: "/convert/wasm/ffmpeg-core.js" });
  await ffmpeg.writeFile("infile", bytes);
  // produce f32le raw samples with WAV header so we can parse sampleRate/channels
  try {
    await ffmpeg.exec(["-i", "infile", "-f", "wav", "out.wav"]);
  } catch (e) {
    // If probing failed, try interpreting input as raw float32 PCM (f32le) with defaults
    try {
      await ffmpeg.exec(["-f", "f32le", "-ar", "44100", "-ac", "1", "-i", "infile", "-f", "wav", "out.wav"]);
    } catch (e2) {
      await ffmpeg.deleteFile("infile");
      throw e2;
    }
  }
  const out = await ffmpeg.readFile("out.wav");
  await ffmpeg.deleteFile("infile");
  await ffmpeg.deleteFile("out.wav");
  // parse WAV header (simple)
  const data = out as Uint8Array;
  const view = new DataView(data.buffer);
  const sampleRate = view.getUint32(24, true);
  const channels = view.getUint16(22, true);
  const bitsPerSample = view.getUint16(34, true);
  const dataOffset = 44;
  let samples: Float32Array;
  if (bitsPerSample === 32) {
    samples = new Float32Array(
      data.buffer,
      dataOffset,
      (data.length - dataOffset) / 4,
    );
  } else if (bitsPerSample === 16) {
    const count = (data.length - dataOffset) / 2;
    samples = new Float32Array(count);
    const dv = new DataView(data.buffer, dataOffset);
    for (let i = 0; i < count; i++)
      samples[i] = dv.getInt16(i * 2, true) / 0x7fff;
  } else {
    throw new Error("Unsupported WAV bit depth: " + bitsPerSample);
  }
  return { samples, sampleRate, channels };
}

class floHandler implements FormatHandler {
  public name: string = "floHandler";
  public supportedFormats: FileFormat[] = [];
  public ready: boolean = false;
  #worker?: Worker;
  #workerReady?: Promise<void>;
  #rpcId: number = 1;
  #pending: Map<number, { resolve: (v: any) => void; reject: (e: any) => void }> = new Map();

  async init() {
    try {
      this.#worker = new Worker(new URL("./flo.worker.ts", import.meta.url), { type: "module" });
      this.#workerReady = new Promise((resolve, reject) => {
        this.#worker!.onmessage = (ev: MessageEvent) => {
          const m = ev.data as any;
          if (m && m.id === 0) {
            if (m.type === "ready") return resolve();
            if (m.type === "error") return reject(m.error);
          }
          // route other messages to pending map
          if (m && typeof m.id === 'number' && m.id !== 0) {
            const p = this.#pending.get(m.id);
            if (p) {
              if (m.type === 'decodeResult') p.resolve({ samples: m.samples, sampleRate: m.sampleRate, channels: m.channels });
              else if (m.type === 'encodeResult') p.resolve(m.bytes);
              else if (m.type === 'error') p.reject(m.error);
              this.#pending.delete(m.id);
            }
          }
        };
        // timeout
        setTimeout(() => reject('flo worker init timeout'), 15000);
      });
      await this.#workerReady;
      console.log("floHandler: reflo worker ready");
    } catch (e) {
      console.warn("floHandler: failed to start reflo worker:", e);
      this.#worker = undefined;
    }
    this.supportedFormats = [
      {
        name: "Flo Audio",
        format: "flo",
        extension: "flo",
        mime: normalizeMimeType("audio/flo"),
        from: true,
        to: true,
        internal: "flo",
        category: "audio",
        lossless: false
      },
      {
        name: "WAV (signed 16-bit)",
        format: "wav",
        extension: "wav",
        mime: normalizeMimeType("audio/wav"),
        from: true,
        to: true,
        internal: "wav",
        category: "audio",
        lossless: true
      },
      {
        name: "Raw PCM Float32LE",
        format: "f32le",
        extension: "pcm",
        mime: normalizeMimeType("video/f32le"),
        from: true,
        to: true,
        internal: "f32le",
        category: "audio",
        lossless: true
      },
    ];
    this.ready = true;
  }

  private _workerDecode(bytes: Uint8Array): Promise<{ samples: Float32Array; sampleRate: number; channels: number }> {
    return new Promise((resolve, reject) => {
      if (!this.#worker) return reject('no worker');
      const id = this.#rpcId++;
      this.#pending.set(id, { resolve, reject });
      try {
        this.#worker.postMessage({ id, type: 'decode', bytes }, [bytes.buffer]);
      } catch (e) {
        this.#pending.delete(id);
        reject(e);
      }
    });
  }

  private _workerEncode(samples: Float32Array, sampleRate: number, channels: number, bitDepth: number): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      if (!this.#worker) return reject('no worker');
      const id = this.#rpcId++;
      this.#pending.set(id, { resolve, reject });
      try {
        this.#worker.postMessage({ id, type: 'encode', samples, sampleRate, channels, bitDepth }, [samples.buffer]);
      } catch (e) {
        this.#pending.delete(id);
        reject(e);
      }
    });
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
    args?: string[],
  ): Promise<FileData[]> {
    if (!inputFiles || inputFiles.length === 0) throw "No input files";
    const file = inputFiles[0];
    const baseName = (() => {
      const idx = file.name.lastIndexOf('.');
      return idx > 0 ? file.name.slice(0, idx) : file.name;
    })();

    // FLO -> outputs
    if (inputFormat.internal === "flo") {
      const bytes = new Uint8Array(file.bytes);
      let samples: Float32Array;
      let sampleRate: number;
      let channels: number;
      if (this.#worker) {
        const res = await this._workerDecode(bytes);
        samples = res.samples;
        sampleRate = res.sampleRate;
        channels = res.channels;
      } else {
        const mod = await import('@flo-audio/reflo');
        samples = mod.decode(bytes);
        const info = mod.get_flo_file_info(bytes);
        sampleRate = info.sample_rate;
        channels = info.channels;
      }

      if (
        outputFormat.internal === "wav" ||
        outputFormat.mime === "audio/wav"
      ) {
        const pcm16 = floatTo16BitPCM(samples);
        const wav = writeWavHeader(pcm16, sampleRate, channels, 16);
        return [{ bytes: wav, name: baseName + ".wav" }];
      }

      if (
        outputFormat.internal === "f32le" ||
        outputFormat.mime === "video/f32le"
      ) {
        const out = new Uint8Array(samples.buffer.slice(0));
        return [{ bytes: out, name: baseName + ".pcm" }];
      }

      // If target is flo, just return same bytes
      if (outputFormat.internal === "flo") {
        return [{ bytes: new Uint8Array(file.bytes), name: file.name }];
      }

      throw `floHandler: unsupported target ${outputFormat.format}`;
    }

    // Inputs -> FLO
    if (outputFormat.internal === "flo") {
      // Try browser decode first
      let decoded: {
        samples: Float32Array;
        sampleRate: number;
        channels: number;
      } | null = null;
      try {
        decoded = await decodeWithBrowser(new Uint8Array(file.bytes));
      } catch (e) {
        // fallback to ffmpeg
        decoded = await decodeWithFFmpeg(new Uint8Array(file.bytes));
      }
      // (samples, sample_rate, channels, bit_depth, metadata)
      let floBytes: Uint8Array;
      if (this.#worker) {
        floBytes = await this._workerEncode(decoded.samples, decoded.sampleRate, decoded.channels, 32);
      } else {
        const mod = await import('@flo-audio/reflo');
        floBytes = mod.encode(decoded.samples, decoded.sampleRate, decoded.channels, 32, null);
      }
      return [{ bytes: new Uint8Array(floBytes), name: baseName + ".flo" }];
    }
    if (
      inputFormat.mime === "audio/wav" ||
      inputFormat.internal === "wav" ||
      inputFormat.mime === "video/f32le" ||
      inputFormat.internal === "f32le"
    ) {
      // pass-through, other handlers (FFmpeg) likely handle this better. For now, just return input file.
      return [{ bytes: new Uint8Array(file.bytes), name: file.name }];
    }

    throw `floHandler: unsupported conversion ${inputFormat.format} -> ${outputFormat.format}`;
  }
}

export default floHandler;


