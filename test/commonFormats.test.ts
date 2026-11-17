import { afterAll, expect, test } from "bun:test";
import puppeteer from "puppeteer";
import { preview } from "vite";
import type { FileData, FormatHandler, FileFormat, ConvertPathNode } from "../src/FormatHandler.js";
import Formats from "../src/Formats.js";
import type { HandlerName } from "../src/handlers/index.js";

declare global {
  interface Window {
    queryFormatNode: (
      testFunction: (value: ConvertPathNode) => boolean,
    ) => ConvertPathNode | undefined;
    tryConvertByTraversing: (
      files: FileData[],
      from: ConvertPathNode,
      to: ConvertPathNode,
    ) => Promise<{
      files: FileData[];
      path: ConvertPathNode[];
    } | null>;
  }
}

// Host the distribution build with vite's preview server (same headers as production),
// plus the test resources under /test/
const server = await preview({
  logLevel: "silent",
  preview: { port: 0 },
  plugins: [
    {
      name: "test-resources",
      configurePreviewServer(server) {
        server.middlewares.use("/test", (req, res, next) => {
          Bun.file(`${__dirname}/resources/${req.url!.replaceAll("..", "")}`)
            .bytes()
            .then(
              (bytes) => res.end(bytes),
              () => next(),
            );
        });
      },
    },
  ],
});

// Start puppeteer, wait for ready confirmation
const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
const page = await browser.newPage();

await Promise.all([
  new Promise((resolve) => {
    page.on("console", (msg) => {
      const text = msg.text();
      if (text === "Built initial format list.") resolve(null);
    });
  }),
  page.goto(server.resolvedUrls!.local[0]),
]);

console.log("Setup finished.");

const dummyHandler: FormatHandler = {
  // a handler that is never registered
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  name: "dummy" as HandlerName,
  ready: true,
  async init() {},
  async doConvert(_inputFiles, inputFormat, outputFormat) {
    return [];
  },
};

function attemptConversion(files: string[], from: FileFormat, to: FileFormat) {
  return page.evaluate(
    async (testFileNames, from, to) => {
      const files: FileData[] = [];
      for (const fileName of testFileNames) {
        files.push({
          bytes: await fetch("/test/" + fileName).then((r) => r.bytes()),
          name: fileName,
        });
      }
      return await window.tryConvertByTraversing(files, from, to);
    },
    files,
    { format: from, handler: dummyHandler },
    { format: to, handler: dummyHandler },
  );
}

// ==================================================================
//                         START OF TESTS
// ==================================================================

test(
  "png → jpeg",
  async () => {
    const conversion = await attemptConversion(["colors_50x50.png"], Formats.PNG, Formats.JPEG);

    expect(conversion).toBeTruthy();
    expect(conversion!.path.map((c) => c.format.mime)).toEqual(["image/png", "image/jpeg"]);
  },
  { timeout: 60000 },
);

test(
  "png → svg",
  async () => {
    const conversion = await attemptConversion(["colors_50x50.png"], Formats.PNG, Formats.SVG);

    expect(conversion).toBeTruthy();
    expect(conversion!.path.map((c) => c.format.mime)).toEqual(["image/png", "image/svg+xml"]);
  },
  { timeout: 60000 },
);

test(
  "mp4 → apng",
  async () => {
    const conversion = await attemptConversion(["doom.mp4"], Formats.MP4, Formats.APNG);

    expect(conversion).toBeTruthy();
    expect(conversion!.path.map((c) => c.format.format)).toEqual(["mp4", "apng"]);
    expect(conversion?.files.length).toBe(1);
  },
  { timeout: 60000 },
);

test(
  "png → mp4",
  async () => {
    const conversion = await attemptConversion(["colors_50x50.png"], Formats.PNG, Formats.MP4);

    expect(conversion).toBeTruthy();
    expect(conversion!.path.map((c) => c.format.mime)).toEqual(["image/png", "video/mp4"]);
  },
  { timeout: 60000 },
);

test(
  "png → wav → mp3",
  async () => {
    const conversion = await attemptConversion(["colors_50x50.png"], Formats.PNG, Formats.MP3);

    expect(conversion).toBeTruthy();
    expect(conversion!.path.map((c) => c.format.mime)).toEqual([
      "image/png",
      "audio/wav",
      "audio/mpeg",
    ]);
  },
  { timeout: 60000 },
);

test(
  "mp3 → png → gif",
  async () => {
    const conversion = await attemptConversion(["gaster.mp3"], Formats.MP3, Formats.GIF);

    expect(conversion).toBeTruthy();
    expect(conversion!.path.map((c) => c.format.mime)).toEqual([
      "audio/mpeg",
      "audio/wav",
      "image/png",
      "image/gif",
    ]);
  },
  { timeout: 60000 },
);

test(
  "docx → typst → pdf",
  async () => {
    const conversion = await attemptConversion(["word.docx"], Formats.DOCX, Formats.PDF);

    expect(conversion).toBeTruthy();
    expect(conversion!.path.map((c) => c.format.mime)).toEqual([
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/typst",
      "application/pdf",
    ]);
    const fileSize = Object.values(conversion!.files[0].bytes).length;
    expect(fileSize).toBeGreaterThan(1000);
  },
  { timeout: 60000 },
);

test(
  "pptx → pdf",
  async () => {
    const conversion = await attemptConversion(
      ["chart-and-complex.pptx"],
      Formats.PPTX,
      Formats.PDF,
    );

    expect(conversion).toBeTruthy();
    expect(conversion!.path.map((c) => c.format.mime)).toEqual([
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/pdf",
    ]);
  },
  { timeout: 120000 },
);

test(
  "md → docx",
  async () => {
    const conversion = await attemptConversion(["markdown.md"], Formats.MD, Formats.DOCX);

    expect(conversion).toBeTruthy();
    expect(conversion!.path.map((c) => c.format.mime)).toEqual([
      "text/markdown",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]);
  },
  { timeout: 60000 },
);

test(
  "txt → wav → flac",
  async () => {
    const conversion = await attemptConversion(["markdown.md"], Formats.TEXT, Formats.FLAC);

    expect(conversion).toBeTruthy();
    expect(conversion!.path.map((c) => c.format.mime)).toEqual([
      "text/plain",
      "audio/wav",
      "audio/flac",
    ]);
    expect(conversion!.path[1].handler.name).toBe("espeakng");
  },
  { timeout: 60000 },
);

// ==================================================================
//                          END OF TESTS
// ==================================================================

afterAll(async () => {
  await browser.close();
  await server.close();
});
