import { expect, test } from "bun:test";
import type { FormatHandler } from "../../src/FormatHandler.js";
import {
  minifyCssHandler,
  minifyJsHandler,
  minifyJson,
  minifySvgHandler,
} from "../../src/handlers/minify.js";

async function run(Handler: new () => FormatHandler, source: string | Uint8Array) {
  const handler = new Handler();
  const [format] = handler.supportedFormats!;
  const bytes = typeof source === "string" ? new TextEncoder().encode(source) : source;
  const [output] = await handler.doConvert([{ name: "in", bytes }], format, format);
  return new TextDecoder().decode(output.bytes);
}

// minifyHtml needs XMLHttpRequest to load, so it is covered by commonFormats.test.ts
test("the minify handlers shrink their format without changing its meaning", async () => {
  const svg = await run(
    minifySvgHandler,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
       <!-- a comment -->
       <rect x="0.000" y="0.000" width="10.000" height="10.000" fill="#ff0000"/>
     </svg>`,
  );
  expect(svg).toContain('viewBox="0 0 10 10"');
  expect(svg).not.toContain("comment");

  expect(await run(minifyCssHandler, "a {\n  color: red;\n}\n/* note */\n")).toBe("a{color:red}");

  const js = await run(
    minifyJsHandler,
    "function add(first, second) {\n  return first + second;\n}\n",
  );
  expect(js.length).toBeLessThan(40);
  expect(js).toContain("function add(");
});

test("the minify handlers refuse text that isn't UTF-8", async () => {
  // "é" in Latin-1
  await expect(run(minifyCssHandler, new Uint8Array([0x61, 0xe9]))).rejects.toThrow();
});

test("minifyJson drops whitespace between tokens only", () => {
  expect(minifyJson('{\n  "a b" : [ 1 ,\t2 ],\r\n  "c": "x  \\" y\\\\"\n}')).toBe(
    '{"a b":[1,2],"c":"x  \\" y\\\\"}',
  );
});

test("minifyJson keeps what a parse and stringify round trip would change", () => {
  const source = '{ "id": 12345678901234567890, "n": 1.0, "k": 1, "k": 2 }';
  expect(minifyJson(source)).toBe('{"id":12345678901234567890,"n":1.0,"k":1,"k":2}');
});

test("minifyJson rejects invalid input instead of rewriting it", () => {
  expect(() => minifyJson("{ not json }")).toThrow();
});
