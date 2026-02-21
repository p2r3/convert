import { TraversionGraph } from "../src/TraversionGraph";
import CommonFormats from "../src/CommonFormats.ts";
import { ConvertPathNode, type FileFormat, type FormatHandler } from "../src/FormatHandler.ts";
import { MockedHandler } from "./MockedHandler.ts";
import { expect, test } from "bun:test";

const handlers : FormatHandler[] = [
  new MockedHandler("canvasToBlob", [
    CommonFormats.PNG.supported("png", true, true, true),
    CommonFormats.JPEG.supported("jpeg", true, true, false),
    CommonFormats.SVG.supported("svg", true, true, true),

  ], false),
  new MockedHandler("meyda", [
    CommonFormats.JPEG.supported("jpeg", true, true, false),
    CommonFormats.PNG.supported("png", true, true, false),
    CommonFormats.WAV.supported("wav", true, true, false)
  ], false),
  new MockedHandler("ffmpeg", [
    CommonFormats.PNG.supported("png", true, true, true),
    CommonFormats.MP3.supported("mp3", true, true, false),
    CommonFormats.WAV.supported("wav", true, true, true),
    CommonFormats.MP4.supported("mp4", true, true, true)
  ], false),
]

let supportedFormatCache = new Map<string, FileFormat[]>();
for (const handler of handlers) {
  if (!supportedFormatCache.has(handler.name)) {
    try {
      await handler.init();
    } catch (_) { continue; }
    if (handler.supportedFormats) {
      supportedFormatCache.set(handler.name, handler.supportedFormats);
    }
  }
  const supportedFormats = supportedFormatCache.get(handler.name);
  if (!supportedFormats) {
    continue;
  }
}

console.log("Testing...\n");
test('should find the optimal path from image to audio\n', async () => {
  const graph = new TraversionGraph();
  graph.init(supportedFormatCache, handlers);

  const paths = graph.searchPath(
    new ConvertPathNode(handlers.find(h => h.name === "canvasToBlob")!, CommonFormats.PNG.supported("png", true, true, true)),
    new ConvertPathNode(handlers.find(h => h.name === "ffmpeg")!, CommonFormats.MP3.supported("mp3", true, true, true)),
    true
  );
  let extractedPaths = [];
  for await (const path of paths)
    extractedPaths.push(path);
  expect(extractedPaths.length).toBeGreaterThan(0);
  const optimalPath = extractedPaths[0];
  expect(optimalPath[0].handler.name).toBe("canvasToBlob");
  expect(optimalPath[optimalPath.length - 1].handler.name).toBe("ffmpeg");
});

test('should find the optimal path from image to audio in strict graph\n', async () => {
  const graph = new TraversionGraph();
  graph.init(supportedFormatCache, handlers, true);

  const paths = graph.searchPath(
    new ConvertPathNode(handlers.find(h => h.name === "canvasToBlob")!, CommonFormats.PNG.supported("png", true, true, true)),
    new ConvertPathNode(handlers.find(h => h.name === "ffmpeg")!, CommonFormats.MP3.supported("mp3", true, true, true)),
    true
  );
  let extractedPaths = [];
  for await (const path of paths)
    extractedPaths.push(path);
  expect(extractedPaths.length).toBeGreaterThan(0);
  const optimalPath = extractedPaths[0];
  expect(optimalPath[0].handler.name).toBe("canvasToBlob");
  expect(optimalPath[optimalPath.length - 1].handler.name).toBe("ffmpeg");
});


test('add category change costs should affect pathfinding\n', async () => {
  const graph = new TraversionGraph();
  graph.init(supportedFormatCache, handlers);

  const paths = graph.searchPath(
    new ConvertPathNode(handlers.find(h => h.name === "canvasToBlob")!, CommonFormats.PNG.supported("png", true, true, true)),
    new ConvertPathNode(handlers.find(h => h.name === "ffmpeg")!, CommonFormats.MP3.supported("mp3", true, true, true)),
    true
  );
  let extractedPaths = [];
  for await (const path of paths)
    extractedPaths.push(path);


  graph.addCategoryChangeCost("image", "audio", 100);
  graph.init(supportedFormatCache, handlers);
  const newPaths = graph.searchPath(
    new ConvertPathNode(handlers.find(h => h.name === "canvasToBlob")!, CommonFormats.PNG.supported("png", true, true, true)),
    new ConvertPathNode(handlers.find(h => h.name === "ffmpeg")!, CommonFormats.MP3.supported("mp3", true, true, true)),
    true
  );
  let extractedNewPaths = [];
  for await (const path of newPaths)
    extractedNewPaths.push(path);
  expect(extractedPaths.length).toBeGreaterThan(0);
  expect(extractedNewPaths.length).toBeGreaterThan(0);
  expect(extractedNewPaths).not.toEqual(extractedPaths);
});

test('remove category change costs should affect pathfinding\n', async () => {
  const graph = new TraversionGraph();
  graph.updateCategoryChangeCost("image", "audio", 100);
  graph.init(supportedFormatCache, handlers);

  const paths = graph.searchPath(
    new ConvertPathNode(handlers.find(h => h.name === "canvasToBlob")!, CommonFormats.PNG.supported("png", true, true, true)),
    new ConvertPathNode(handlers.find(h => h.name === "ffmpeg")!, CommonFormats.MP3.supported("mp3", true, true, true)),
    true
  );
  let extractedPaths = [];
  for await (const path of paths)
    extractedPaths.push(path);


  graph.removeCategoryChangeCost("image", "audio");
  graph.init(supportedFormatCache, handlers);
  const newPaths = graph.searchPath(
    new ConvertPathNode(handlers.find(h => h.name === "canvasToBlob")!, CommonFormats.PNG.supported("png", true, true, true)),
    new ConvertPathNode(handlers.find(h => h.name === "ffmpeg")!, CommonFormats.MP3.supported("mp3", true, true, true)),
    true
  );
  let extractedNewPaths = [];
  for await (const path of newPaths)
    extractedNewPaths.push(path);
  expect(extractedPaths.length).toBeGreaterThan(0);
  expect(extractedNewPaths.length).toBeGreaterThan(0);
  expect(extractedNewPaths).not.toEqual(extractedPaths);
});

test('add adaptive category costs should affect pathfinding\n', async () => {
  const graph = new TraversionGraph();
  graph.init(supportedFormatCache, handlers);

  const paths = graph.searchPath(
    new ConvertPathNode(handlers.find(h => h.name === "canvasToBlob")!, CommonFormats.PNG.supported("png", true, true, true)),
    new ConvertPathNode(handlers.find(h => h.name === "ffmpeg")!, CommonFormats.MP3.supported("mp3", true, true, true)),
    true
  );
  let extractedPaths = [];
  for await (const path of paths)
    extractedPaths.push(path);


  graph.addCategoryAdaptiveCost(["image", "audio"], 20000);
  graph.init(supportedFormatCache, handlers);
  const newPaths = graph.searchPath(
    new ConvertPathNode(handlers.find(h => h.name === "canvasToBlob")!, CommonFormats.PNG.supported("png", true, true, true)),
    new ConvertPathNode(handlers.find(h => h.name === "ffmpeg")!, CommonFormats.MP3.supported("mp3", true, true, true)),
    true
  );
  let extractedNewPaths = [];
  for await (const path of newPaths)
    extractedNewPaths.push(path);
  expect(extractedPaths.length).toBeGreaterThan(0);
  expect(extractedNewPaths.length).toBeGreaterThan(0);
  expect(extractedNewPaths).not.toEqual(extractedPaths);
});

test('remove adaptive category costs should affect pathfinding\n', async () => {
  const graph = new TraversionGraph();
  graph.init(supportedFormatCache, handlers);

  const paths = graph.searchPath(
    new ConvertPathNode(handlers.find(h => h.name === "canvasToBlob")!, CommonFormats.PNG.supported("png", true, true, true)),
    new ConvertPathNode(handlers.find(h => h.name === "ffmpeg")!, CommonFormats.MP3.supported("mp3", true, true, true)),
    true
  );
  let extractedPaths = [];
  for await (const path of paths)
    extractedPaths.push(path);


  graph.removeCategoryAdaptiveCost(["image", "video", "audio"]);
  graph.init(supportedFormatCache, handlers);
  const newPaths = graph.searchPath(
    new ConvertPathNode(handlers.find(h => h.name === "canvasToBlob")!, CommonFormats.PNG.supported("png", true, true, true)),
    new ConvertPathNode(handlers.find(h => h.name === "ffmpeg")!, CommonFormats.MP3.supported("mp3", true, true, true)),
    true
  );
  let extractedNewPaths = [];
  for await (const path of newPaths)
    extractedNewPaths.push(path);
  expect(extractedPaths.length).toBeGreaterThan(0);
  expect(extractedNewPaths.length).toBeGreaterThan(0);
  expect(extractedNewPaths[0]).not.toEqual(extractedPaths[0]);
});
