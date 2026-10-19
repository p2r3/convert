import { expect, test } from "bun:test";
import { stalls } from "../src/common/index.ts";

/** A source of activity that the test fires by hand, and that counts its subscribers. */
function activity() {
  const listeners = new Set<() => void>();
  return {
    listeners,
    fire: () => listeners.forEach((alive) => alive()),
    subscribe: (alive: () => void) => {
      listeners.add(alive);
      return () => listeners.delete(alive);
    },
  };
}
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("stalls reports a task that goes quiet, and stops listening", async () => {
  const signs = activity();
  const never = new Promise(() => {});

  expect(await stalls(never, signs.subscribe, 30)).toBe(true);
  expect(signs.listeners.size).toBe(0);
});

test("stalls leaves a task alone for as long as it shows signs of life", async () => {
  const signs = activity();
  const { promise: run, resolve: finish } = Promise.withResolvers<void>();
  const result = stalls(run, signs.subscribe, 40);

  // silent for 25 ms at a time, which adds up to far more than the 40 ms it is allowed
  for (let i = 0; i < 5; i++) {
    await sleep(25);
    signs.fire();
  }
  finish();

  expect(await result).toBe(false);
  expect(signs.listeners.size).toBe(0);
});

test("stalls does not call a task that failed a stalled one", async () => {
  const signs = activity();
  expect(await stalls(Promise.reject(new Error("crashed")), signs.subscribe, 30)).toBe(false);
});
