import { expect, test } from "bun:test";
import { compressGzip, decompressGzip, fetchGzip } from "../src/common/gzip.ts";
import { gzipSync } from "fflate";

test("gzip fallbacks round-trip without native compression streams", async () => {
  const compression = globalThis.CompressionStream;
  const decompression = globalThis.DecompressionStream;
  try {
    Object.assign(globalThis, { CompressionStream: undefined, DecompressionStream: undefined });
    const input = new TextEncoder().encode("old browsers can still convert gzip files");
    const compressed = await compressGzip(input);
    expect(Array.from(compressed.slice(0, 2))).toEqual([0x1f, 0x8b]);
    expect(await decompressGzip(compressed)).toEqual(input);
  } finally {
    Object.assign(globalThis, {
      CompressionStream: compression,
      DecompressionStream: decompression,
    });
  }
});

test("fetchGzip detects a gzip header split across network chunks", async () => {
  const originalFetch = globalThis.fetch;
  const input = new TextEncoder().encode("split gzip header");
  const bytes = gzipSync(input);
  globalThis.fetch = (async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(bytes.slice(0, 1));
          controller.enqueue(bytes.slice(1));
          controller.close();
        },
      }),
    )) as typeof fetch;
  try {
    expect(new Uint8Array(await (await fetchGzip("test.gz")).arrayBuffer())).toEqual(input);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchGzip accepts server-decompressed data without response streams", async () => {
  const originalFetch = globalThis.fetch;
  const decompression = globalThis.DecompressionStream;
  const input = new TextEncoder().encode("already decompressed");
  globalThis.fetch = (async () => new Response(input)) as typeof fetch;
  try {
    Object.assign(globalThis, { DecompressionStream: undefined });
    expect(new Uint8Array(await (await fetchGzip("test.gz")).arrayBuffer())).toEqual(input);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.DecompressionStream = decompression;
  }
});
