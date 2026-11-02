import { expect, test } from "bun:test";
import { estimateBpm } from "../../src/handlers/metadata.ts";

/** Clicks of noise on every beat, at a fixed tempo. */
function clickTrack(bpm: number, rate: number, seconds: number) {
  const samples = new Float32Array(rate * seconds);
  const period = (60 / bpm) * rate;
  let seed = 1;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let t = 0; t < samples.length; t += period) {
    for (let i = 0; i < 100 && t + i < samples.length; i++) samples[Math.floor(t) + i] = noise();
  }
  return samples;
}

test("estimateBpm finds the tempo of a click track", () => {
  for (const bpm of [90, 120, 128]) {
    expect(Math.abs(estimateBpm(clickTrack(bpm, 11025, 20), 11025)! - bpm)).toBeLessThan(1);
  }
});

test("estimateBpm gives up on silence and on clips too short to repeat", () => {
  expect(estimateBpm(new Float32Array(11025 * 10), 11025)).toBeUndefined();
  expect(estimateBpm(clickTrack(120, 11025, 1), 11025)).toBeUndefined();
});
