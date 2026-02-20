import { expect, test } from "bun:test";
import zstdHandler from "../src/handlers/zstd.ts";
import type { FileFormat } from "../src/FormatHandler.ts";

const zstdFormat: FileFormat = {
  name: "Zstandard Compressed Data",
  format: "zst",
  extension: "zst",
  mime: "application/zstd",
  from: true,
  to: false,
  internal: "zstd"
};

const rawFormat: FileFormat = {
  name: "Raw Binary Data",
  format: "bin",
  extension: "bin",
  mime: "application/octet-stream",
  from: false,
  to: true,
  internal: "raw"
};

test("zstd handler decodes .zst to raw bytes", async () => {
  const input = new TextEncoder().encode("hello zstd");
  const compressed = Bun.zstdCompressSync(input);

  const handler = new zstdHandler();
  await handler.init();

  const output = await handler.doConvert(
    [{ name: "sample.zst", bytes: new Uint8Array(compressed) }],
    zstdFormat,
    rawFormat
  );

  expect(output).toHaveLength(1);
  expect(output[0].name).toBe("sample");
  expect(new TextDecoder().decode(output[0].bytes)).toBe("hello zstd");
});
