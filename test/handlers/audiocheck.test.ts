// Copied from github.com/Gitguy268/audiocheck (MIT) at bbc7879, tests/unit/analyze.test.ts.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  analyzeSpectrum,
  findCutoff,
  judge,
  pcmDigest,
  sampleStats,
  worst,
  type Facts,
} from "../../src/handlers/audiocheck/analyze.ts";

const RATE = 44100;

function random(seed: number): () => number {
  // mulberry32
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function noise(seconds: number, rate = RATE, seed = 1): Float32Array {
  const next = random(seed);
  return Float32Array.from({ length: seconds * rate }, () => (next() * 2 - 1) * 0.3);
}

/** Blackman-windowed sinc low-pass: a brick wall like the one a lossy encoder applies. */
function lowpass(x: Float32Array, cutoffHz: number, rate = RATE): Float32Array {
  const taps = 1023;
  const mid = (taps - 1) / 2;
  const fc = cutoffHz / rate;
  const h = Float64Array.from({ length: taps }, (_, i) => {
    const m = i - mid;
    const sinc = m === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * m) / (Math.PI * m);
    return (
      sinc *
      (0.42 -
        0.5 * Math.cos((2 * Math.PI * i) / (taps - 1)) +
        0.08 * Math.cos((4 * Math.PI * i) / (taps - 1)))
    );
  });
  const y = new Float32Array(x.length);
  for (let n = taps; n < x.length; n++) {
    let acc = 0;
    for (let k = 0; k < taps; k++) acc += h[k]! * x[n - k]!;
    y[n] = acc;
  }
  return y;
}

const cutoffOf = (x: Float32Array, rate = RATE) => findCutoff(analyzeSpectrum([x], rate).bands);

test("white noise fills the band: no cutoff", () => {
  assert.equal(cutoffOf(noise(3)), null);
});

test("a brick wall at 16 kHz is found within 300 Hz", () => {
  const cutoff = cutoffOf(lowpass(noise(3), 16000));
  assert.ok(cutoff, "no cutoff found");
  assert.ok(Math.abs(cutoff.hz - 16000) <= 300, `cutoff at ${cutoff.hz}`);
  assert.ok(cutoff.dropDb >= 20);
});

test("a gentle roll-off is not a cutoff", () => {
  const x = noise(3);
  // One-pole low-pass at about 2 kHz: 6 dB per octave, like a dull recording.
  let y = 0;
  const dull = x.map((v) => (y += 0.25 * (v - y)));
  assert.equal(cutoffOf(dull), null);
});

test("a lone 19 kHz tone is not a cutoff", () => {
  const x = noise(3).map((v, i) => v * 0.01 + 0.5 * Math.sin((2 * Math.PI * 19000 * i) / RATE));
  assert.equal(cutoffOf(x), null);
});

test("96 kHz audio that stops at 22 kHz has its edge found there", () => {
  const cutoff = cutoffOf(lowpass(noise(2, 96000), 22000, 96000), 96000);
  assert.ok(cutoff && Math.abs(cutoff.hz - 22000) <= 400, `cutoff at ${cutoff?.hz}`);
});

test("pcmDigest packs samples the way FLAC hashes them", () => {
  const next = random(7);
  const frames = 5000;
  for (const bits of [16, 24]) {
    const bytes = bits / 8;
    const packed = Buffer.alloc(frames * 2 * bytes);
    const left = new Float32Array(frames);
    const right = new Float32Array(frames);
    for (let i = 0; i < frames; i++) {
      for (const [c, channel] of [left, right].entries()) {
        const v = Math.floor((next() - 0.5) * 2 ** bits);
        packed.writeIntLE(v, (i * 2 + c) * bytes, bytes);
        channel[i] = v / 2 ** (bits - 1);
      }
    }
    const digest = pcmDigest([left, right], bits);
    assert.equal(
      Buffer.from(digest.md5).toString("hex"),
      createHash("md5").update(packed).digest("hex"),
    );
    assert.equal(digest.exact, true);
    assert.equal(digest.effectiveBits, bits);
  }
});

test("16-bit audio in a 24-bit file shows 16 effective bits", () => {
  const next = random(3);
  const x = Float32Array.from(
    { length: 4000 },
    () => (Math.floor((next() - 0.5) * 65536) * 256) / 2 ** 23,
  );
  assert.equal(pcmDigest([x], 24).effectiveBits, 16);
});

test("pcmDigest also reads Chromium's 16-bit floats, where positive samples are divided by 32767", () => {
  const ints = [-32768, -9879, 5561, 32767, 0, 4788];
  const packed = Buffer.alloc(ints.length * 2);
  ints.forEach((v, i) => packed.writeInt16LE(v, i * 2));
  const digest = pcmDigest([Float32Array.from(ints, (v) => v / (v > 0 ? 32767 : 32768))], 16);
  assert.equal(digest.exact, true);
  assert.equal(
    Buffer.from(digest.md5).toString("hex"),
    createHash("md5").update(packed).digest("hex"),
  );
});

test("values that are not whole samples mark the decode as inexact", () => {
  assert.equal(pcmDigest([Float32Array.of(0.1, 0.2)], 16).exact, false);
});

test("flat tops are counted, a clean sine is not", () => {
  const top = 32767 / 32768;
  const sine = (gain: number) =>
    Float32Array.from({ length: RATE }, (_, i) =>
      Math.max(-1, Math.min(top, gain * Math.sin((2 * Math.PI * 997 * i) / RATE))),
    );
  const clipped = sampleStats([sine(2)]);
  assert.ok(clipped.clipRuns > 1500, `runs: ${clipped.clipRuns}`);
  assert.ok(clipped.clippedSamples > clipped.clipRuns * 3);
  assert.deepEqual(sampleStats([sine(0.5)]), {
    peak: sampleStats([sine(0.5)]).peak,
    clippedSamples: 0,
    clipRuns: 0,
  });
});

const flac: Facts = {
  codec: "FLAC",
  lossless: true,
  supported: true,
  sampleRate: 44100,
  bits: 16,
  kbps: 900,
  expectedFrames: 441000,
  decodedFrames: 441000,
  cutoff: null,
  effectiveBits: 16,
  checksum: "match",
  stats: { peak: 0.5, clippedSamples: 0, clipRuns: 0 },
  loudness: { lufs: -14, range: 6, truePeak: -1 },
};
const texts = (f: Partial<Facts>) => judge({ ...flac, ...f });
const find = (f: Partial<Facts>, check: string) => texts(f).filter((x) => x.check === check);

test("a clean lossless file has nothing to report", () => {
  assert.equal(worst(judge(flac)), "ok");
});

test("lossless with a 16.8 kHz edge is suspicious and names the bitrate", () => {
  const [finding] = find({ cutoff: { hz: 16800, dropDb: 50 } }, "source");
  assert.equal(finding?.level, "warn");
  assert.match(finding.text, /16\.8 kHz.*128 kbps/);
});

test("lossless with a 20.3 kHz edge gets the weaker wording", () => {
  const [finding] = find({ cutoff: { hz: 20300, dropDb: 50 } }, "source");
  assert.equal(finding?.level, "note");
  assert.match(finding.text, /^Possibly/);
});

test("an edge at 21.6 kHz is the normal top of CD audio", () => {
  assert.equal(find({ cutoff: { hz: 21600, dropDb: 40 } }, "source")[0]?.level, "ok");
});

test("an MP3 is only questioned when its cutoff is low for its bitrate", () => {
  const mp3 = { codec: "MP3", lossless: false, bits: null, effectiveBits: null, checksum: null };
  assert.equal(
    find({ ...mp3, kbps: 128, cutoff: { hz: 16800, dropDb: 50 } }, "source")[0]?.level,
    "ok",
  );
  assert.equal(
    find({ ...mp3, kbps: 320, cutoff: { hz: 16800, dropDb: 50 } }, "source")[0]?.level,
    "warn",
  );
});

test("hi-res with nothing above CD range is called upsampled, with the source rate", () => {
  const hires = {
    sampleRate: 96000,
    bits: 24,
    effectiveBits: 24,
    expectedFrames: 960000,
    decodedFrames: 960000,
  };
  assert.match(
    find({ ...hires, cutoff: { hz: 21800, dropDb: 60 } }, "resolution")[0]!.text,
    /44\.1 kHz source/,
  );
  assert.match(
    find({ ...hires, cutoff: { hz: 23700, dropDb: 60 } }, "resolution")[0]!.text,
    /48 kHz source/,
  );
  assert.equal(worst(texts({ ...hires, cutoff: null })), "ok");
});

test("padded bit depth, damage and truncation are reported", () => {
  assert.match(
    find({ bits: 24, effectiveBits: 16 }, "resolution")[0]!.text,
    /24-bit file holding 16-bit audio/,
  );
  assert.equal(find({ checksum: "mismatch" }, "integrity")[0]?.level, "bad");
  assert.match(find({ checksum: "unchecked" }, "integrity")[0]!.text, /could not be compared/);
  assert.match(
    find({ decodedFrames: 220500 }, "integrity")[0]!.text,
    /promises 0:10 but only 0:05/,
  );
  assert.match(
    find({ decodedFrames: 441000 - 4096, checksum: null }, "integrity")[0]!.text,
    /4,096 samples/,
  );
  assert.equal(worst(texts({ decodedFrames: null })), "bad");
  assert.equal(worst(texts({ decodedFrames: null, supported: false })), "note");
});
