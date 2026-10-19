// Copied from github.com/Gitguy268/audiocheck (MIT) at bbc7879, with two changes marked below.
// Change it there and copy it again.
// Browser side: reads the header, decodes at the file's own rate, measures and judges.
import LoudnessNode, { type LoudnessSnapshot } from "loudness-worklet";
import { parseBlob } from "music-metadata";
import {
  analyzeSpectrum,
  findCutoff,
  judge,
  pcmDigest,
  sampleStats,
  worst,
  type Cutoff,
  type Facts,
  type Finding,
  type Level,
  type Loudness,
  type SampleStats,
  type Spectrum,
} from "./analyze.ts";

export interface Report {
  name: string;
  /** For display, e.g. "FLAC, 44.1 kHz, 16-bit". */
  format: string;
  sampleRate: number;
  findings: Finding[];
  level: Level;
  cutoff: Cutoff | null;
  loudness: Loudness | null;
  stats: SampleStats | null;
  checksum: Facts["checksum"];
  spectrum: Spectrum | null;
}

// Two tiny FLAC files of white noise, 16-bit and 24-bit, made with:
//   ffmpeg -f lavfi -i anoisesrc=c=white:r=44100:a=0.5:d=0.004:s=5 -c:a flac -sample_fmt s16 \
//     -bitexact -map_metadata -1 -metadata_header_padding 0 self16.flac
// (-sample_fmt s32 -bits_per_raw_sample 24 for the second.) Each carries the MD5 of its own samples.
const SELF_TEST: readonly (readonly [bits: number, flac: string])[] = [
  [
    16,
    "ZkxhQwAAACISABIAAAFmAAFmCsRA8AAAALCnKTd7dnhSu98RW8O7olcehAAADgYAAABmZm1wZWcAAAAA//hpCACvWULZaRW55+8k4P4PaSHLeUln0f5JR99LeclYpIXd3rZHk6KYFZXz16ohMpHSF41y8iiGJ2MqRWpz53byfkopcjGYrpIywYjAOFBywQacm/uqj3p/SyJSF5EhqXo1rQJlPqt7/hsFdWEt3rZncxPsZcBNgH3fhpnvkLZNjBYLXu3W7ko4ENXzCCzUtjJdf3dqv8+AmCayAummUcdScpEwxVKoGYPlZYqPe9hSdteQyu6uJigwek/E/e0hZ2ArTpymrGgawReeml6daXOyeQj6gb1o3lz1ER47ll7TxRNU4hRblcwYaJ4AncDsrv9ytHM4Er8Bca+3kHMlUhmQTXUo6Xn43MW3SJZkV9g4tUcTUHplTvmP5sY/h34nHn5q51bQuXhry/EkUsFyeNFpyv+322VSru9gzynKJIxMRfWiP2G2FvT0e40s8HLvMT24iAKbWgaxcRbK2aD9hI61c2hr6Q==",
  ],
  [
    24,
    "ZkxhQwAAACISABIAAAIWAAIWCsRBcAAAALCyK5cgZmNd6RH9E0s/TvPehAAADgYAAABmZm1wZWcAAAAA//hpDACv8kLZaVgVuKvn7yTg/o20kWjluUikuEfo/yckk7PvnGW8y2SsfZJC9L7vXnsjwInRPUwKy8r6RCvVCxCZyMjo8AvG8nl4xZRCuxOxPhUilrU6kvO823k/gyUVLbkZ1cxY20kZ+2DD3GAasig5B2CFb05O6f3T3UfDpT+qVZEp6Qu9KJDQqL0hAtZ7+TKh31XPbf7oDYL9+q/blu+r2zMZOYpm9jJ04ComwELG78TbTP9/yG4LJrbGCv8Fr42W65c3JUC8CLmq+U3EFkvKWtLZLkC/vMW1YEbnv1xMFJdZArd01DEo5BepOKRImF5iqxlUC/TB+SaywI1HwRXsJfE7ZRPIWkV3ZvcTMtQYYbqT778/fbVIVV3YEHrTqIcqBGsZtYav9kXn7GaX9mdaGZztFp5BuD6eZG9d9jeYJz1ElEeRxuWZR7UUcUTJpThlhRcTpXLghhoop4A7p3BL+yv1v9wYrRy8zgfcr7yAXG9T7c8kHJnJVFGGY7xTXWBKPSZef743Mptt2CYlmgcV9gsOLblRxe7UJGKZSSu+N0P51hGP3yHfjQnHqr+a67nWibQroF4guvMBtEkPfLBkvJ41BFp2zr/vhfbiGVS6a7vkWDPNynKhiSMfkxATfWVMj894bX8lvUWNHwyjSzb8HDU7ywRPchoh/1qm3O6Bowxcy0WzAvZnRz9iXyOvwVzd2iyh",
  ],
];

const same = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

let exact: Promise<boolean> | undefined;

/**
 * The bit-depth and checksum checks only mean something if this browser's decoder hands back
 * the exact sample values. This decodes the two built-in files and compares each with the MD5
 * in its own header (bytes 26 to 41 of a FLAC file).
 */
export function decoderIsExact(): Promise<boolean> {
  exact ??= (async () => {
    for (const [bits, flac] of SELF_TEST) {
      const bytes = Uint8Array.from(atob(flac), (c) => c.charCodeAt(0));
      const stored = bytes.slice(26, 42);
      const audio = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(bytes.buffer);
      const digest = pcmDigest([audio.getChannelData(0)], bits);
      if (!digest.exact || digest.effectiveBits !== bits || !same(digest.md5, stored)) return false;
    }
    return true;
  })().catch(() => false);
  return exact;
}

async function measureLoudness(audio: AudioBuffer): Promise<Loudness | null> {
  // The worklet reports every 0.1 s, so a quarter second of silence is rendered after the
  // audio: the last report then covers the real end. One output channel keeps the render small.
  const context = new OfflineAudioContext(
    1,
    audio.length + Math.ceil(audio.sampleRate * 0.25),
    audio.sampleRate,
  );
  // the one change from audiocheck: vite.config.js copies the worklet into "external"
  await context.audioWorklet.addModule(
    new URL("external/loudness/loudness.worklet.js", globalThis.baseUrl).href,
  );
  const source = new AudioBufferSourceNode(context, { buffer: audio });
  const meter = new LoudnessNode(context);
  // A worklet stops running once its inputs fall silent; this keeps it going through the tail.
  const keepAlive = new ConstantSourceNode(context, { offset: 0 });
  keepAlive.connect(meter);
  keepAlive.start();
  let body: LoudnessSnapshot | undefined;
  let last: LoudnessSnapshot | undefined;
  const end = new Promise<void>((resolve) => {
    meter.port.addEventListener("message", (event: MessageEvent<Float32Array[]>) => {
      last = LoudnessNode.from(event.data[0]!);
      // Loudness is read before the added silence, which would pull it down; peaks after it.
      if (last.currentTime <= audio.duration) body = last;
      if (last.currentTime >= audio.duration + 0.1) resolve();
    });
  });
  source.connect(meter).connect(context.destination);
  source.start();
  // the second change from audiocheck: when the page is cross-origin isolated, the meter writes
  // into shared memory and sends no messages, so the render pauses at the end of the audio to
  // read it there, and once more at the very end
  if (globalThis.crossOriginIsolated) {
    const data = new Float32Array(meter.metricCount);
    const quantum = 128 / audio.sampleRate;
    void context.suspend(Math.floor(audio.duration / quantum) * quantum).then(() => {
      meter.getFloatLoudnessData(data);
      body = LoudnessNode.from(data);
      return context.resume();
    });
    await context.startRendering();
    meter.getFloatLoudnessData(data);
    last = LoudnessNode.from(data);
  } else {
    await context.startRendering();
    await Promise.race([
      end,
      new Promise<void>((resolve) => {
        setTimeout(resolve, 1000);
      }),
    ]);
  }
  if (!last) return null;
  body ??= last;
  return {
    lufs: body.integratedLoudness,
    range: body.loudnessRange,
    truePeak: last.maximumTruePeakLevel,
  };
}

/** Sample count and audio MD5 from a FLAC file's STREAMINFO block, which always comes first. */
async function flacStreamInfo(file: Blob): Promise<{ frames: number; md5: Uint8Array } | null> {
  const head = new Uint8Array(await file.slice(0, 42).arrayBuffer());
  if (head.length < 42 || String.fromCharCode(...head.subarray(0, 4)) !== "fLaC") return null;
  // The sample count is 36 bits: the low 4 bits of byte 21, then bytes 22 to 25.
  const frames = (head[21]! & 0x0f) * 2 ** 32 + new DataView(head.buffer).getUint32(22);
  return { frames, md5: head.slice(26, 42) };
}

export async function checkFile(file: File): Promise<Report> {
  const flac = await flacStreamInfo(file);
  const header = await parseBlob(file, { duration: true, skipCovers: true }).then(
    (metadata) => metadata.format,
    () => undefined,
  );
  const extension = file.name.split(".").pop()?.toUpperCase() ?? "Audio";
  const rawCodec = header?.codec ?? header?.container ?? extension;
  const codec = /Layer 3/.test(rawCodec) ? "MP3" : rawCodec;
  const sampleRate = header?.sampleRate ?? 44100;
  const lossless = header?.lossless ?? false;
  const bits = header?.bitsPerSample ?? null;
  const kbps = header?.bitrate ? header.bitrate / 1000 : null;

  let audio: AudioBuffer | null = null;
  try {
    // A context at the file's own rate, so decoding does not resample.
    audio = await new OfflineAudioContext(1, 1, sampleRate).decodeAudioData(
      await file.arrayBuffer(),
    );
  } catch {
    audio = null;
  }

  let spectrum: Spectrum | null = null;
  let stats: SampleStats | null = null;
  let loudness: Loudness | null = null;
  let effectiveBits: number | null = null;
  let checksum: Facts["checksum"] = null;
  if (audio) {
    const channels = Array.from({ length: audio.numberOfChannels }, (_, c) =>
      audio.getChannelData(c),
    );
    spectrum = analyzeSpectrum(channels, audio.sampleRate);
    stats = sampleStats(channels);
    // All zeros means the encoder did not store a checksum.
    const stored = flac?.md5.some((byte) => byte !== 0) ? flac.md5 : null;
    if (stored) checksum = "unchecked";
    // shortcut: stereo and mono only, since the channel order of surround files after
    // decoding is not verified; extend when a surround FLAC with a known MD5 is at hand.
    if (lossless && bits && channels.length <= 2 && (await decoderIsExact())) {
      const digest = pcmDigest(channels, bits);
      if (digest.exact) {
        effectiveBits = digest.effectiveBits;
        if (stored) checksum = same(digest.md5, stored) ? "match" : "mismatch";
      }
    }
    loudness = await measureLoudness(audio).catch(() => null);
  }

  const cutoff = spectrum && findCutoff(spectrum.bands);
  const findings = judge({
    codec,
    lossless,
    supported: /flac|pcm|layer 3|vorbis|opus|aac/i.test(rawCodec),
    sampleRate,
    bits,
    kbps,
    // Zero in a FLAC header means the encoder did not know the length.
    expectedFrames: flac?.frames || header?.numberOfSamples || null,
    decodedFrames: audio?.length ?? null,
    cutoff,
    effectiveBits,
    checksum,
    stats,
    loudness,
  });
  const format = [
    codec,
    `${sampleRate / 1000} kHz`,
    bits && `${bits}-bit`,
    !lossless && kbps && `${Math.round(kbps)} kbps`,
  ]
    .filter(Boolean)
    .join(", ");
  return {
    name: file.name,
    format,
    sampleRate,
    findings,
    level: worst(findings),
    cutoff,
    loudness,
    stats,
    checksum,
    spectrum,
  };
}
