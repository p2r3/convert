import { afterAll, expect, test } from "bun:test";
import puppeteer from "puppeteer";
import type { FileData, FormatHandler, FileFormat, ConvertPathNode } from "../src/FormatHandler.js";
import CommonFormats from "../src/CommonFormats.js";

declare global {
  interface Window {
    queryFormatNode: (testFunction: (value: ConvertPathNode) => boolean) => ConvertPathNode | undefined;
    tryConvertByTraversing: (files: FileData[], from: ConvertPathNode, to: ConvertPathNode) => Promise<{
      files: FileData[];
      path: ConvertPathNode[];
    } | null>;
  }
}

// Set up a basic webserver to host the distribution build
const server = Bun.serve({
  async fetch (req) {
    let path = new URL(req.url).pathname.replace("/convert/", "") || "index.html";
    path = path.replaceAll("..", "");
    if (path.startsWith("/test/")) path = "../test/resources/" + path.slice(6);
    const file = Bun.file(`${__dirname}/../dist/${path}`);
    if (!(await file.exists())) return new Response("Not Found", { status: 404 });
    return new Response(file);
  },
  port: 8080
});

// Start puppeteer, wait for ready confirmation
const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"]
});
const page = await browser.newPage();

await Promise.all([
  new Promise(resolve => {
    page.on("console", msg => {
      const text = msg.text();
      if (text === "Built initial format list.") resolve(null);
    });
  }),
  page.goto("http://localhost:8080/convert/index.html")
]);

console.log("Setup finished.");

const dummyHandler: FormatHandler = {
  name: "dummy",
  ready: true,
  async init () { },
  async doConvert (inputFiles, inputFormat, outputFormat, args) {
    return [];
  }
};

function attemptConversion (
  files: string[],
  from: FileFormat,
  to: FileFormat
) {
  return page.evaluate(async (testFileNames, from, to) => {
    const files: FileData[] = [];
    for (const fileName of testFileNames) {
      files.push({
        bytes: await fetch("/test/" + fileName).then(r => r.bytes()),
        name: fileName
      });
    }
    return await window.tryConvertByTraversing(files, from, to);
  },
    files,
    { format: from, handler: dummyHandler },
    { format: to, handler: dummyHandler }
  );
}

function findPath(from: FileFormat, to: FileFormat) {
  return page.evaluate(async (from, to) => {
    const iterator = window.traversionGraph.searchPath(
      { format: from, handler: { name: "test-from" } },
      { format: to },
      false,
    );
    const result = await iterator.next();
    return result.value?.map((step: ConvertPathNode) => ({
      handler: step.handler.name,
      format: step.format.format,
      mime: step.format.mime,
    })) ?? null;
  }, from, to);
}

// ==================================================================
//                         START OF TESTS
// ==================================================================

test("png → jpeg", async () => {

  const conversion = await attemptConversion(
    ["colors_50x50.png"],
    CommonFormats.PNG,
    CommonFormats.JPEG
  );

  expect(conversion).toBeTruthy();
  expect(conversion!.path.map(c => c.format.mime)).toEqual(["image/png", "image/jpeg"]);

}, { timeout: 60000 });

test("png → svg", async () => {

  const conversion = await attemptConversion(
    ["colors_50x50.png"],
    CommonFormats.PNG,
    CommonFormats.SVG
  );

  expect(conversion).toBeTruthy();
  expect(conversion!.path.map(c => c.format.mime)).toEqual(["image/png", "image/svg+xml"]);

}, { timeout: 60000 });

test("mp4 → apng", async () => {

  const conversion = await attemptConversion(
    ["doom.mp4"],
    CommonFormats.MP4,
    CommonFormats.PNG.builder("apng").withFormat("apng")
  );

  expect(conversion).toBeTruthy();
  expect(conversion!.path.map(c => c.format.format)).toEqual(["mp4", "apng"]);
  expect(conversion?.files.length).toBe(1);

}, { timeout: 60000 });

test("png → mp4", async () => {

  const conversion = await attemptConversion(
    ["colors_50x50.png"],
    CommonFormats.PNG,
    CommonFormats.MP4
  );

  expect(conversion).toBeTruthy();
  expect(conversion!.path.map(c => c.format.mime)).toEqual(["image/png", "video/mp4"]);

}, { timeout: 60000 });

test("png → wav → mp3", async () => {

  const conversion = await attemptConversion(
    ["colors_50x50.png"],
    CommonFormats.PNG,
    CommonFormats.MP3
  );

  expect(conversion).toBeTruthy();
  expect(conversion!.path.map(c => c.format.mime)).toEqual(["image/png", "audio/wav", "audio/mpeg"]);

}, { timeout: 60000 });

test("mp3 → png → gif", async () => {

  const conversion = await attemptConversion(
    ["gaster.mp3"],
    CommonFormats.MP3,
    CommonFormats.GIF
  );

  expect(conversion).toBeTruthy();
  expect(conversion!.path.map(c => c.format.mime)).toEqual(["audio/mpeg", "image/png", "image/gif"]);

}, { timeout: 60000 });

test("docx → pdf", async () => {

  const conversion = await attemptConversion(
    ["word.docx"],
    CommonFormats.DOCX,
    CommonFormats.PDF
  );

  expect(conversion).toBeTruthy();
  expect([
    [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/pdf",
    ],
    [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/html",
      "image/svg+xml",
      "image/png",
      "application/pdf",
    ],
  ].some(
    (expected) =>
      expected.length === conversion!.path.length
      && expected.every((m, i) => conversion!.path[i].format.mime === m),
  )).toBe(true);
  expect(Object.values(conversion!.files[0].bytes).length).toBeGreaterThan(1000);

}, { timeout: 60000 });

test("pptx → pdf uses pptx-renderer", async () => {
  const path = await findPath(
    CommonFormats.PPTX,
    CommonFormats.PDF,
  );

  expect(path).toBeTruthy();
  expect(path!.map(step => step.mime)).toEqual([
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/pdf",
  ]);
  expect(path!.map(step => step.handler)).toEqual([
    "test-from",
    "pptx-renderer",
  ]);
}, { timeout: 60000 });

test("pptx → pdf converts via pptx-renderer", async () => {
  const conversion = await attemptConversion(
    ["chart-and-complex.pptx"],
    CommonFormats.PPTX,
    CommonFormats.PDF,
  );

  expect(conversion).toBeTruthy();
  expect(conversion!.path.map(c => c.format.mime)).toEqual([
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/pdf",
  ]);
  expect(conversion!.path[1].handler.name).toBe("pptx-renderer");

  const fileSize = Object.values(conversion!.files[0].bytes).length;
  expect(fileSize).toBeGreaterThan(10_000);
}, { timeout: 120000 });

test("md → docx", async () => {

  const conversion = await attemptConversion(
    ["markdown.md"],
    CommonFormats.MD,
    CommonFormats.DOCX
  );

  expect(conversion).toBeTruthy();
  expect(conversion!.path.map(c => c.format.mime)).toEqual([
    "text/markdown", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ]);

}, { timeout: 60000 });

test("txt → wav → flac", async () => {

  const conversion = await attemptConversion(
    ["markdown.md"],
    CommonFormats.TEXT,
    CommonFormats.FLAC
  );

  expect(conversion).toBeTruthy();
  expect(conversion!.path.map(c => c.format.mime)).toEqual([
    "text/plain", "audio/wav", "audio/flac"
  ]);
  expect(conversion!.path[1].handler.name).toBe("espeakng");

}, { timeout: 60000 });

// ==================================================================
//                          END OF TESTS
// ==================================================================


afterAll(async () => {
  await browser.close();
  server.stop();
});
