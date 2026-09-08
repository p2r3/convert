import { afterAll, expect, test } from "bun:test";
import puppeteer from "puppeteer";
import type { FileData, FormatHandler, FileFormat, ConvertPathNode } from "../src/FormatHandler.js";
import CommonFormats from "../src/CommonFormats.js";
import { IMAGE_TEXT_MARKER, decodeImageText } from "../src/handlers/imageTextCodec.ts";

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

test("png → tagged txt → png preserves dimensions and grayscale pixels", async () => {
  const roundTrip = await page.evaluate(async (pngFormat, textFormat) => {
    const source: FileData[] = [{
      bytes: await fetch("/test/colors_50x50.png").then(r => r.bytes()),
      name: "colors_50x50.png",
    }];
    const node = (format: FileFormat): ConvertPathNode => ({
      format,
      handler: { name: "test" } as FormatHandler,
    });

    const textConversion = await window.tryConvertByTraversing(
      source,
      node(pngFormat),
      node(textFormat),
    );
    if (!textConversion) return null;

    const imageConversion = await window.tryConvertByTraversing(
      textConversion.files,
      node(textFormat),
      node(pngFormat),
    );
    if (!imageConversion) return null;

    const imageBlob = new Blob([imageConversion.files[0].bytes as BlobPart], { type: "image/png" });
    const imageUrl = URL.createObjectURL(imageBlob);
    const image = new Image();
    try {
      await new Promise<void>((resolve, reject) => {
        image.addEventListener("load", () => resolve());
        image.addEventListener("error", () => reject(new Error("round-trip PNG failed to load")));
        image.src = imageUrl;
      });

      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("round-trip canvas context unavailable");
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let isGrayscale = true;
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index] !== pixels[index + 1] || pixels[index] !== pixels[index + 2]) {
          isGrayscale = false;
          break;
        }
      }

      return {
        text: new TextDecoder().decode(textConversion.files[0].bytes),
        width: canvas.width,
        height: canvas.height,
        isGrayscale,
      };
    } finally {
      URL.revokeObjectURL(imageUrl);
    }
  }, CommonFormats.PNG, CommonFormats.TEXT);

  expect(roundTrip).toBeTruthy();
  expect(roundTrip!.width).toBe(50);
  expect(roundTrip!.height).toBe(50);
  expect(roundTrip!.isGrayscale).toBe(true);

  const markerIndex = roundTrip!.text.indexOf(IMAGE_TEXT_MARKER);
  expect(markerIndex).toBeGreaterThan(0);
  expect(roundTrip!.text.slice(0, markerIndex).trim().length).toBeGreaterThan(0);

  const decodedText = decodeImageText(roundTrip!.text);
  expect(decodedText?.width).toBe(50);
  expect(decodedText?.height).toBe(50);
  expect(decodedText?.pixels.length).toBe(50 * 50 * 4);
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

test("docx → html → svg → png → pdf", async () => {

  const conversion = await attemptConversion(
    ["word.docx"],
    CommonFormats.DOCX,
    CommonFormats.PDF
  );

  expect(conversion).toBeTruthy();
  expect(conversion!.path.map(c => c.format.mime)).toEqual([
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/html", "image/svg+xml", "image/png", "application/pdf"
  ]);
  const fileSize = Object.values(conversion!.files[0].bytes).length;
  expect(fileSize).toBeWithin(55000, 65000);

}, { timeout: 60000 });

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
