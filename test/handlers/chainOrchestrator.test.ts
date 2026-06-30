import { describe, it, expect } from "bun:test";
import { runChain } from "../../src/runChain";
import type { FormatOption, SegmentRunner } from "../../src/runChain";
import type { FileData, FileFormat } from "../../src/FormatHandler";
import { MockedHandler } from "../MockedHandler";

const makeFormat = (format: string, mime: string): FileFormat => ({
  format,
  mime,
  extension: format,
  name: format,
  from: true,
  to: true,
  lossless: false,
  internal: undefined,
  category: "data" as any,
});

const makeOption = (format: string, mime: string): FormatOption => {
  const handler = new MockedHandler(`handler-${format}`);
  return { format: makeFormat(format, mime), handler };
};

const makeFiles = (name: string): FileData[] => [
  { name, bytes: new Uint8Array([1, 2, 3]) },
];

const successRunner =
  (label: string): SegmentRunner =>
  async (files, from, to) => ({
    files: [{ name: `${label}.${to.format.extension}`, bytes: files[0].bytes }],
    path: [
      { format: from.format, handler: from.handler } as any,
      { format: to.format, handler: to.handler } as any,
    ],
  });

const failRunner: SegmentRunner = async () => null;

describe("runChain", () => {
  it("fewer than 2 segments returns input unchanged", async () => {
    const png = makeOption("png", "image/png");
    const files = makeFiles("image.png");
    const result = await runChain(files, [png], successRunner("out"));
    expect(result.legs).toHaveLength(0);
    expect(result.finalFiles).toBe(files);
    expect(result.failedAt).toBeUndefined();
  });

  it("single leg direct conversion runs one segment", async () => {
    const png = makeOption("png", "image/png");
    const wav = makeOption("wav", "audio/wav");
    const files = makeFiles("image.png");
    const calls: string[] = [];
    const runner: SegmentRunner = async (f, from, to, legIndex, totalLegs) => {
      calls.push(`${from.format.format}->${to.format.format} leg=${legIndex}/${totalLegs}`);
      return { files: [{ name: `out.wav`, bytes: f[0].bytes }], path: [] };
    };
    const result = await runChain(files, [png, wav], runner);
    expect(calls).toEqual(["png->wav leg=0/1"]);
    expect(result.legs).toHaveLength(1);
    expect(result.finalFiles[0].name).toBe("out.wav");
    expect(result.failedAt).toBeUndefined();
  });

  it("three-leg chain runs segments in order with chained inputs", async () => {
    const a = makeOption("a", "type/a");
    const b = makeOption("b", "type/b");
    const c = makeOption("c", "type/c");
    const d = makeOption("d", "type/d");
    const callOrder: string[] = [];
    const runner: SegmentRunner = async (files, from, to) => {
      callOrder.push(`${from.format.format}->${to.format.format}`);
      return {
        files: [{ name: `out.${to.format.format}`, bytes: new Uint8Array([callOrder.length]) }],
        path: [],
      };
    };
    const result = await runChain(makeFiles("in.a"), [a, b, c, d], runner);
    expect(callOrder).toEqual(["a->b", "b->c", "c->d"]);
    expect(result.legs).toHaveLength(3);
    expect(result.finalFiles[0].name).toBe("out.d");
    expect(result.failedAt).toBeUndefined();
    // Each leg's input bytes come from the previous leg's output
    expect(result.legs[1].files[0].bytes[0]).toBe(2);
    expect(result.legs[2].files[0].bytes[0]).toBe(3);
  });

  it("failing middle leg sets failedAt and preserves prior legs", async () => {
    const a = makeOption("a", "type/a");
    const b = makeOption("b", "type/b");
    const c = makeOption("c", "type/c");
    let callCount = 0;
    const runner: SegmentRunner = async (files, from, to) => {
      callCount++;
      if (callCount === 2) return null;
      return { files: [{ name: `out.${to.format.format}`, bytes: files[0].bytes }], path: [] };
    };
    const result = await runChain(makeFiles("in.a"), [a, b, c], runner);
    expect(result.failedAt).toBe(1);
    expect(result.legs).toHaveLength(1);
  });

  it("identical adjacent segments are skipped", async () => {
    const png = makeOption("png", "image/png");
    const wav = makeOption("wav", "audio/wav");
    const calls: string[] = [];
    const runner: SegmentRunner = async (f, from, to) => {
      calls.push(`${from.format.format}->${to.format.format}`);
      return { files: [{ name: `out.${to.format.format}`, bytes: f[0].bytes }], path: [] };
    };
    // [png, png, wav] — first segment is a no-op
    const result = await runChain(makeFiles("in.png"), [png, png, wav], runner);
    expect(calls).toEqual(["png->wav"]);
    expect(result.legs).toHaveLength(1);
  });

  it("legs retain per-leg output files for intermediate downloads", async () => {
    const a = makeOption("a", "type/a");
    const b = makeOption("b", "type/b");
    const c = makeOption("c", "type/c");
    let step = 0;
    const runner: SegmentRunner = async (f, from, to) => {
      step++;
      return {
        files: [{ name: `step${step}.${to.format.format}`, bytes: new Uint8Array([step]) }],
        path: [],
      };
    };
    const result = await runChain(makeFiles("in.a"), [a, b, c], runner);
    expect(result.legs[0].files[0].name).toBe("step1.b");
    expect(result.legs[1].files[0].name).toBe("step2.c");
    // finalFiles should equal the last leg's output
    expect(result.finalFiles[0].name).toBe("step2.c");
  });
});
