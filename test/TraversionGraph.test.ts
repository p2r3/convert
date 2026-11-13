import { TraversionGraph } from "../src/TraversionGraph";
import Formats, { SpecialFormats } from "../src/Formats.ts";
import { ConvertPathNode, type FormatHandler } from "../src/FormatHandler.ts";
import { MockedHandler } from "./MockedHandler.ts";
import { expect, test } from "bun:test";

const handlers: FormatHandler[] = [
  new MockedHandler("canvasToBlob", [
    Formats.PNG.builder("png").lossless().fromTo(),
    Formats.JPEG.builder("jpeg").fromTo(),
    Formats.SVG.builder("svg").lossless().fromTo(),
  ]),
  new MockedHandler("meyda", [
    Formats.JPEG.builder("jpeg").fromTo(),
    Formats.PNG.builder("png").fromTo(),
    Formats.WAV.builder("wav").fromTo(),
  ]),
  new MockedHandler("FFmpeg", [
    Formats.PNG.builder("png").lossless().fromTo(),
    Formats.MP3.builder("mp3").fromTo(),
    Formats.WAV.builder("wav").lossless().fromTo(),
    Formats.MP4.builder("mp4").lossless().fromTo(),
  ]),
  new MockedHandler("sevenZip", [
    SpecialFormats.ANY.builder("ANY").from(),
    Formats.ZIP.builder("zip").lossless().to(),
  ]),
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
    { simpleMode: true },
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
    { simpleMode: true },
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
    { simpleMode: true },
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
    { simpleMode: true },
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
    { simpleMode: true },
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
    { simpleMode: true },
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
    { simpleMode: true },
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
    { simpleMode: true },
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
    { simpleMode: true },
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
    { simpleMode: true },
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
    { simpleMode: true },
  );
  let extractedPaths = [];
  for await (const path of paths) extractedPaths.push(path);
  expect(extractedPaths.length).toBeGreaterThan(0);
  expect(extractedPaths[0][0].format.format).toBe("png");
  expect(extractedPaths[0][extractedPaths[0].length - 1].format.format).toBe("zip");
  expect(extractedPaths[0][extractedPaths[0].length - 1].handler.name).toBe("sevenZip");
});

test("should stop at ANY output and only continue from it when searching from ANY\n", async () => {
  const anyHandlers = [
    new MockedHandler("canvasToBlob", [
      Formats.PNG.builder("png").lossless().fromTo(),
      Formats.JPEG.builder("jpeg").fromTo(),
    ]),
    new MockedHandler("sevenZip", [
      Formats.ZIP.builder("zip").lossless().fromTo(),
      SpecialFormats.ANY.builder("ANY").lossless().fromTo(),
    ]),
  ];
  const [canvas, sevenZip] = anyHandlers;
  const png = new ConvertPathNode(canvas, Formats.PNG.builder("png").lossless().fromTo());
  const jpeg = new ConvertPathNode(canvas, Formats.JPEG.builder("jpeg").fromTo());
  const zip = new ConvertPathNode(sevenZip, Formats.ZIP.builder("zip").lossless().fromTo());
  const any = new ConvertPathNode(sevenZip, SpecialFormats.ANY.builder("ANY").lossless().fromTo());
  const graph = new TraversionGraph();
  graph.init(anyHandlers);
  const search = async (from: ConvertPathNode, to: ConvertPathNode) => {
    const found = [];
    for await (const path of graph.searchPath(from, to, { simpleMode: true }))
      found.push(path.map((node) => node.format.format));
    return found;
  };

  // zip → jpeg can only be planned up to the extraction
  expect(await search(zip, jpeg)).toEqual([["zip", "ANY"]]);
  // Starting from ANY passes everything on instead of stopping right away
  expect(await search(any, zip)).toEqual([["ANY", "zip"]]);
  // Packing generically and then extracting again is never offered
  expect(await search(png, jpeg)).toEqual([["png", "jpeg"]]);

  // Cost estimates assume ANY reaches everything, unless only known paths count
  const toJpeg = (optimistic: boolean) => graph.getFormatCosts(jpeg.format, "from", optimistic);
  expect(toJpeg(true).has("application/zip(zip)")).toBe(true);
  expect(toJpeg(false).has("application/zip(zip)")).toBe(false);
  expect(toJpeg(false).has("image/png(png)")).toBe(true);
});

test("should not route a lossless conversion through a lossy format\n", async () => {
  const audioHandlers = [
    new MockedHandler("mediabunny", [
      Formats.WAV.builder("wav").lossless().fromTo(),
      Formats.OGG.builder("ogg").fromTo(),
      Formats.FLAC.builder("flac").lossless().fromTo(),
    ]),
    new MockedHandler("FFmpeg", [
      ...Array.from({ length: 50 }, (_, i) => Formats.MP3.builder(`filler${i}`).fromTo()),
      Formats.WAV.builder("wav").lossless().fromTo(),
      Formats.FLAC.builder("flac").lossless().fromTo(),
      Formats.FLO.builder("flo").lossless().fromTo(),
    ]),
  ];
  const [mediabunny, ffmpeg] = audioHandlers;
  const flac = new ConvertPathNode(mediabunny, Formats.FLAC.builder("flac").lossless().fromTo());
  const wav = new ConvertPathNode(mediabunny, Formats.WAV.builder("wav").lossless().fromTo());
  const graph = new TraversionGraph();
  graph.init(audioHandlers);
  // Both direct conversions failed, so a detour is needed
  graph.addDeadEndPath([flac, wav]);
  graph.addDeadEndPath([flac, new ConvertPathNode(ffmpeg, wav.format)]);

  const paths = graph.searchPath(flac, wav, { simpleMode: true });
  const { value: path } = await paths.next();
  expect(path!.map((node) => node.format.format)).toEqual(["flac", "flo", "wav"]);
});
