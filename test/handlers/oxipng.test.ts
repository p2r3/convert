import { beforeAll, expect, test } from "bun:test";
import { deflateSync } from "node:zlib";
import { Image } from "mupdf";
import { init } from "@jsquash/oxipng/optimise.js";
import oxipngHandler from "../../src/handlers/oxipng.ts";

// the codec would fetch its own wasm, and the DOM that other test files register refuses file: URLs
beforeAll(async () => {
  const wasm = Bun.file("node_modules/@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm");
  await init(await wasm.arrayBuffer());
});

const SIZE = 64;
const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function chunk(type: string, data: Uint8Array) {
  const body = new Uint8Array([...new TextEncoder().encode(type), ...data]);
  const out = new Uint8Array(body.length + 8);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(body, 4);
  view.setUint32(body.length + 4, Bun.hash.crc32(body));
  return out;
}

/** A truecolour gradient with thousands of colours, stored without any compression. */
function storedPng() {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, SIZE);
  view.setUint32(4, SIZE);
  header.set([8, 2, 0, 0, 0], 8); // 8 bits per channel, RGB

  const rows = new Uint8Array(SIZE * (1 + SIZE * 3));
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      rows.set([x * 4, y * 4, (x + y) * 2], y * (1 + SIZE * 3) + 1 + x * 3);
    }
  }
  return new Uint8Array([
    ...SIGNATURE,
    ...chunk("IHDR", header),
    ...chunk("IDAT", deflateSync(rows, { level: 0 })),
    ...chunk("IEND", new Uint8Array()),
  ]);
}

const pixels = (png: Uint8Array) => [...new Image(png).toPixmap().getPixels()];

test("oxipng makes a PNG smaller without changing a pixel", async () => {
  const input = storedPng();
  const untouched = new Uint8Array(input);
  const handler = new oxipngHandler();
  const [format] = handler.supportedFormats;

  const [output] = await handler.doConvert(
    [{ name: "gradient.png", bytes: input }],
    format,
    format,
  );

  expect(output.name).toBe("gradient.png");
  expect(output.bytes.length).toBeLessThan(input.length / 4);
  expect(pixels(output.bytes)).toEqual(pixels(input));
  // a handler must not change the bytes it was given
  expect(input).toEqual(untouched);
});
