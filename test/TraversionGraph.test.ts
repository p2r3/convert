import { TraversionGraph } from "../src/TraversionGraph";
import Formats, { SpecialFormats } from "../src/Formats.ts";
import { ConvertPathNode, type FormatHandler } from "../src/FormatHandler.ts";
import { MockedHandler } from "./MockedHandler.ts";
import { expect, test } from "bun:test";

const handlers: FormatHandler[] = [
  new MockedHandler(
    "canvasToBlob",
    [
      Formats.PNG.builder("png").lossless().fromTo(),
      Formats.JPEG.builder("jpeg").fromTo(),
      Formats.SVG.builder("svg").lossless().fromTo(),
    ],
    false,
  ),
  new MockedHandler(
    "meyda",
    [
      Formats.JPEG.builder("jpeg").fromTo(),
      Formats.PNG.builder("png").fromTo(),
      Formats.WAV.builder("wav").fromTo(),
    ],
    false,
  ),
  new MockedHandler(
    "FFmpeg",
    [
      Formats.PNG.builder("png").lossless().fromTo(),
      Formats.MP3.builder("mp3").fromTo(),
      Formats.WAV.builder("wav").lossless().fromTo(),
      Formats.MP4.builder("mp4").lossless().fromTo(),
    ],
    false,
  ),
  new MockedHandler("sevenZip", [Formats.ZIP.builder("zip").lossless().to()], true),
];

console.log("Testing...\n");
test("should find the optimal path from image to audio\n", async () => {
  const graph = new TraversionGraph();
  graph.init(handlers);

  const paths = graph.searchPath(
    new ConvertPathNode(
      handlers.find((h) => h.name === "canvasToBlob")!,
      Formats.PNG.builder("png").lossless().fromTo(),
    ),
    new ConvertPathNode(
      handlers.find((h) => h.name === "FFmpeg")!,
      Formats.MP3.builder("mp3").lossless().fromTo(),
    ),
    true,
  );
  let extractedPaths = [];
  for await (const path of paths) extractedPaths.push(path);
  expect(extractedPaths.length).toBeGreaterThan(0);
  const optimalPath = extractedPaths[0];
  expect(optimalPath[0].handler.name).toBe("canvasToBlob");
  expect(optimalPath[optimalPath.length - 1].handler.name).toBe("FFmpeg");
});

test("should find the optimal path from image to audio in strict graph\n", async () => {
  const graph = new TraversionGraph();
  graph.init(handlers, true);

  const paths = graph.searchPath(
    new ConvertPathNode(
      handlers.find((h) => h.name === "canvasToBlob")!,
      Formats.PNG.builder("png").lossless().fromTo(),
    ),
    new ConvertPathNode(
      handlers.find((h) => h.name === "FFmpeg")!,
      Formats.MP3.builder("mp3").lossless().fromTo(),
    ),
    true,
  );
  let extractedPaths = [];
  for await (const path of paths) extractedPaths.push(path);
  expect(extractedPaths.length).toBeGreaterThan(0);
  const optimalPath = extractedPaths[0];
  expect(optimalPath[0].handler.name).toBe("canvasToBlob");
  expect(optimalPath[optimalPath.length - 1].handler.name).toBe("FFmpeg");
});

test("add category change costs should affect pathfinding\n", async () => {
  const graph = new TraversionGraph();
  graph.init(handlers);

  const paths = graph.searchPath(
    new ConvertPathNode(
      handlers.find((h) => h.name === "canvasToBlob")!,
      Formats.PNG.builder("png").lossless().fromTo(),
    ),
    new ConvertPathNode(
      handlers.find((h) => h.name === "FFmpeg")!,
      Formats.MP3.builder("mp3").lossless().fromTo(),
    ),
    true,
  );
  let extractedPaths = [];
  for await (const path of paths) extractedPaths.push(path);

  graph.addCategoryChangeCost("image", "audio", 100);
  graph.init(handlers);
  const newPaths = graph.searchPath(
    new ConvertPathNode(
      handlers.find((h) => h.name === "canvasToBlob")!,
      Formats.PNG.builder("png").lossless().fromTo(),
    ),
    new ConvertPathNode(
      handlers.find((h) => h.name === "FFmpeg")!,
      Formats.MP3.builder("mp3").lossless().fromTo(),
    ),
    true,
  );
  let extractedNewPaths = [];
  for await (const path of newPaths) extractedNewPaths.push(path);
  expect(extractedPaths.length).toBeGreaterThan(0);
  expect(extractedNewPaths.length).toBeGreaterThan(0);
  expect(extractedNewPaths).not.toEqual(extractedPaths);
});

test("remove category change costs should affect pathfinding\n", async () => {
  const graph = new TraversionGraph();
  graph.updateCategoryChangeCost("image", "audio", 100);
  graph.init(handlers);

  const paths = graph.searchPath(
    new ConvertPathNode(
      handlers.find((h) => h.name === "canvasToBlob")!,
      Formats.PNG.builder("png").lossless().fromTo(),
    ),
    new ConvertPathNode(
      handlers.find((h) => h.name === "FFmpeg")!,
      Formats.MP3.builder("mp3").lossless().fromTo(),
    ),
    true,
  );
  let extractedPaths = [];
  for await (const path of paths) extractedPaths.push(path);

  graph.removeCategoryChangeCost("image", "audio");
  graph.init(handlers);
  const newPaths = graph.searchPath(
    new ConvertPathNode(
      handlers.find((h) => h.name === "canvasToBlob")!,
      Formats.PNG.builder("png").lossless().fromTo(),
    ),
    new ConvertPathNode(
      handlers.find((h) => h.name === "FFmpeg")!,
      Formats.MP3.builder("mp3").lossless().fromTo(),
    ),
    true,
  );
  let extractedNewPaths = [];
  for await (const path of newPaths) extractedNewPaths.push(path);
  expect(extractedPaths.length).toBeGreaterThan(0);
  expect(extractedNewPaths.length).toBeGreaterThan(0);
  expect(extractedNewPaths).not.toEqual(extractedPaths);
});

test("add adaptive category costs should affect pathfinding\n", async () => {
  const graph = new TraversionGraph();
  graph.init(handlers);

  const paths = graph.searchPath(
    new ConvertPathNode(
      handlers.find((h) => h.name === "canvasToBlob")!,
      Formats.PNG.builder("png").lossless().fromTo(),
    ),
    new ConvertPathNode(
      handlers.find((h) => h.name === "FFmpeg")!,
      Formats.MP3.builder("mp3").lossless().fromTo(),
    ),
    true,
  );
  let extractedPaths = [];
  for await (const path of paths) extractedPaths.push(path);

  graph.addCategoryAdaptiveCost(["image", "audio"], 20000);
  graph.init(handlers);
  const newPaths = graph.searchPath(
    new ConvertPathNode(
      handlers.find((h) => h.name === "canvasToBlob")!,
      Formats.PNG.builder("png").lossless().fromTo(),
    ),
    new ConvertPathNode(
      handlers.find((h) => h.name === "FFmpeg")!,
      Formats.MP3.builder("mp3").lossless().fromTo(),
    ),
    true,
  );
  let extractedNewPaths = [];
  for await (const path of newPaths) extractedNewPaths.push(path);
  expect(extractedPaths.length).toBeGreaterThan(0);
  expect(extractedNewPaths.length).toBeGreaterThan(0);
  expect(extractedNewPaths).not.toEqual(extractedPaths);
});

test("remove adaptive category costs should affect pathfinding\n", async () => {
  const graph = new TraversionGraph();
  graph.init(handlers);

  const paths = graph.searchPath(
    new ConvertPathNode(
      handlers.find((h) => h.name === "canvasToBlob")!,
      Formats.PNG.builder("png").lossless().fromTo(),
    ),
    new ConvertPathNode(
      handlers.find((h) => h.name === "FFmpeg")!,
      Formats.MP3.builder("mp3").lossless().fromTo(),
    ),
    true,
  );
  let extractedPaths = [];
  for await (const path of paths) extractedPaths.push(path);

  graph.removeCategoryAdaptiveCost(["image", "video", "audio"]);
  graph.init(handlers);
  const newPaths = graph.searchPath(
    new ConvertPathNode(
      handlers.find((h) => h.name === "canvasToBlob")!,
      Formats.PNG.builder("png").lossless().fromTo(),
    ),
    new ConvertPathNode(
      handlers.find((h) => h.name === "FFmpeg")!,
      Formats.MP3.builder("mp3").lossless().fromTo(),
    ),
    true,
  );
  let extractedNewPaths = [];
  for await (const path of newPaths) extractedNewPaths.push(path);
  expect(extractedPaths.length).toBeGreaterThan(0);
  expect(extractedNewPaths.length).toBeGreaterThan(0);
  expect(extractedNewPaths[0]).not.toEqual(extractedPaths[0]);
});

test("should find path from image to archive via anyinput\n", async () => {
  const graph = new TraversionGraph();
  graph.init(handlers);

  const paths = graph.searchPath(
    new ConvertPathNode(
      handlers.find((h) => h.name === "canvasToBlob")!,
      Formats.PNG.builder("png").lossless().fromTo(),
    ),
    new ConvertPathNode(
      handlers.find((h) => h.name === "sevenZip")!,
      Formats.ZIP.builder("zip").lossless().to(),
    ),
    true,
  );
  let extractedPaths = [];
  for await (const path of paths) extractedPaths.push(path);
  expect(extractedPaths.length).toBeGreaterThan(0);
  expect(extractedPaths[0][0].format.format).toBe("png");
  expect(extractedPaths[0][extractedPaths[0].length - 1].format.format).toBe("zip");
  expect(extractedPaths[0][extractedPaths[0].length - 1].handler.name).toBe("sevenZip");
});

test("should stop at ANY output\n", async () => {
  const anyHandlers = [
    new MockedHandler("canvasToBlob", [
      Formats.PNG.builder("png").lossless().fromTo(),
      Formats.JPEG.builder("jpeg").fromTo(),
    ]),
    new MockedHandler("sevenZip", [
      Formats.ZIP.builder("zip").lossless().fromTo(),
      SpecialFormats.ANY.builder("ANY").lossless().to(),
    ]),
  ];
  const [canvas, sevenZip] = anyHandlers;
  const png = new ConvertPathNode(canvas, Formats.PNG.builder("png").lossless().fromTo());
  const jpeg = new ConvertPathNode(canvas, Formats.JPEG.builder("jpeg").fromTo());
  const zip = new ConvertPathNode(sevenZip, Formats.ZIP.builder("zip").lossless().fromTo());
  const graph = new TraversionGraph();
  graph.init(anyHandlers);
  const search = async (from: ConvertPathNode, to: ConvertPathNode) => {
    const found = [];
    for await (const path of graph.searchPath(from, to, true))
      found.push(path.map((node) => node.format.format));
    return found;
  };

  // zip → jpeg can only be planned up to the extraction
  expect(await search(zip, jpeg)).toEqual([["zip", "ANY"]]);
  // Packing generically and then extracting again is never offered
  expect(await search(png, jpeg)).toEqual([["png", "jpeg"]]);

  // Cost estimates assume ANY reaches everything, unless only known paths count
  const toJpeg = (optimistic: boolean) => graph.getFormatCosts(jpeg.format, "from", optimistic);
  expect(toJpeg(true).has("application/zip(zip)")).toBe(true);
  expect(toJpeg(false).has("application/zip(zip)")).toBe(false);
  expect(toJpeg(false).has("image/png(png)")).toBe(true);
});
