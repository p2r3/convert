import { expect, test } from "bun:test";
import Formats from "../src/Formats.ts";
import { ConvertPathNode, type FormatHandler } from "../src/FormatHandler.ts";
import { distributeOptions, pathSupportsOptions, sanitizeOptions } from "../src/Settings.ts";
import { TraversionGraph } from "../src/TraversionGraph.ts";
import { MockedHandler } from "./MockedHandler.ts";

const handlers: FormatHandler[] = [
  new MockedHandler("canvasToBlob", [
    Formats.PNG.builder("png").lossless().fromTo(),
    Formats.JPEG.builder("jpeg").options({ quality: true }).fromTo(),
  ]),
  new MockedHandler("ImageMagick", [
    Formats.PNG.builder("png").lossless().options({ width: true, height: true }).fromTo(),
    Formats.JPEG.builder("jpeg").options({ width: true, height: true, quality: true }).fromTo(),
  ]),
  new MockedHandler("FFmpeg", [
    Formats.PNG.builder("png").lossless().fromTo(),
    Formats.JPEG.builder("jpeg").from(),
    Formats.MP4.builder("mp4")
      .options({ fps: true, videoCodec: { type: "enum", values: ["h264", "hevc"] } })
      .fromTo(),
  ]),
];
const handler = (name: string) => handlers.find((h) => h.name === name)!;
const format = (name: string, format: string) =>
  handler(name).supportedFormats!.find((f) => f.format === format)!;
const node = (name: string, formatName: string) =>
  new ConvertPathNode(handler(name), format(name, formatName));

test("sanitizeOptions keeps only declared options with valid values", () => {
  const mp4 = format("FFmpeg", "mp4");
  expect(sanitizeOptions(mp4, { fps: 30, videoCodec: "h264" })).toEqual({
    fps: 30,
    videoCodec: "h264",
  });
  expect(
    sanitizeOptions(mp4, { fps: -1, videoCodec: "h264 -i /etc/passwd", width: 100, toString: 1 }),
  ).toEqual({});
  expect(sanitizeOptions(format("FFmpeg", "png"), { width: 100 })).toEqual({});
  expect(sanitizeOptions(format("ImageMagick", "png"), { width: 1.5, height: 2 })).toEqual({
    height: 2,
  });
  // `true` only means something for shared settings
  expect(sanitizeOptions({ ...mp4, options: { custom: true } }, { custom: 1 })).toEqual({});
  expect(sanitizeOptions(mp4)).toEqual({});
});

test("distributeOptions gives content options to the first capable step and encoding options to the last", () => {
  const path = [
    node("canvasToBlob", "png"),
    node("ImageMagick", "png"),
    node("ImageMagick", "jpeg"),
  ];
  const result = distributeOptions(path, { width: 64, quality: 80, fps: 10 });
  expect(result.path.map((n) => n.options)).toEqual([undefined, { width: 64 }, { quality: 80 }]);
  expect(result.unsupported).toEqual(["fps"]);
  expect(path.every((n) => n.options === undefined)).toBe(true);

  // quality on an intermediate step doesn't count
  const viaJpeg = [node("canvasToBlob", "png"), node("ImageMagick", "jpeg"), node("FFmpeg", "mp4")];
  expect(pathSupportsOptions(viaJpeg, ["quality"])).toBe(false);
  expect(pathSupportsOptions(viaJpeg, ["width", "fps"])).toBe(true);
  expect(pathSupportsOptions([node("canvasToBlob", "png")], ["width"])).toBe(false);
});

test("searchPath only yields paths that support the required options", async () => {
  const graph = new TraversionGraph();
  graph.init(handlers);
  const from = node("canvasToBlob", "png");
  const to = node("canvasToBlob", "jpeg");

  const first = async (required: string[]) => {
    const search = graph.searchPath(from, to, true, undefined, undefined, required);
    const path = (await search.next()).value as ConvertPathNode[] | undefined;
    await search.return(undefined);
    return path;
  };

  expect((await first([]))!.at(-1)!.handler.name).toBe("canvasToBlob");
  expect((await first(["quality"]))!.at(-1)!.handler.name).toBe("canvasToBlob");
  const resized = (await first(["width", "quality"]))!;
  expect(pathSupportsOptions(resized, ["width", "quality"])).toBe(true);
  expect(resized.some((n) => n.handler.name === "ImageMagick")).toBe(true);
  expect(await first(["videoCodec"])).toBeUndefined();
});
