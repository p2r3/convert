import { afterAll, expect, test } from "bun:test";
import puppeteer from "puppeteer";
import type { FileData, FormatHandler, FileFormat, ConvertPathNode } from "../src/FormatHandler.js";
import Formats from "../src/Formats.js";
import type { HandlerName } from "../src/handlers/index.js";
import type { ConversionSettings } from "../src/ConversionSettings.js";

declare global {
  interface Window {
    queryFormatNode: (
      testFunction: (value: ConvertPathNode) => boolean,
    ) => ConvertPathNode | undefined;
    tryConvertByTraversing: (
      files: FileData[],
      from: ConvertPathNode,
      to: ConvertPathNode,
      signal?: AbortSignal,
      settings?: ConversionSettings,
    ) => Promise<{
      files: FileData[];
      path: ConvertPathNode[];
    } | null>;
  }
}

// Set up a basic webserver to host the distribution build
const server = Bun.serve({
  async fetch(req) {
    let path = new URL(req.url).pathname.replace("/convert/", "") || "index.html";
    path = path.replaceAll("..", "");
    if (path.startsWith("/test/")) path = "../test/resources/" + path.slice(6);
    const file = Bun.file(`${__dirname}/../dist/${path}`);
    if (!(await file.exists())) return new Response("Not Found", { status: 404 });
    return new Response(file);
  },
  port: 0,
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
  page.goto(`http://localhost:${server.port}/convert/index.html`),
]);

console.log("Setup finished.");

const dummyHandler: FormatHandler = {
  name: "dummy" as HandlerName,
  ready: true,
  async init() {},
  async doConvert(_inputFiles, inputFormat, outputFormat, _args) {
    return [];
  },
};

function attemptConversion(
  files: string[],
  from: FileFormat,
  to: FileFormat,
  settings?: ConversionSettings,
) {
  return page.evaluate(
    async (testFileNames, from, to, settings) => {
      const files: FileData[] = [];
      for (const fileName of testFileNames) {
        files.push({
          bytes: await fetch("/test/" + fileName).then((r) => r.bytes()),
          name: fileName,
        });
      }
      const result = await window.tryConvertByTraversing(files, from, to, undefined, settings);
      // byte arrays don't survive the trip out of the page, so measure them here
      return result && { ...result, size: result.files[0].bytes.length };
    },
    files,
    { format: from, handler: dummyHandler },
    { format: to, handler: dummyHandler },
    settings,
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
  "png → jpeg respects the quality setting",
  async () => {
    const low = await attemptConversion(["colors_50x50.png"], Formats.PNG, Formats.JPEG, {
      quality: 10,
    });
    const high = await attemptConversion(["colors_50x50.png"], Formats.PNG, Formats.JPEG, {
      quality: 95,
    });

    expect(low).toBeTruthy();
    expect(high).toBeTruthy();
    expect(low!.size).toBeLessThan(high!.size);
  },
  { timeout: 60000 },
);

test(
  "mp4 → gif",
  async () => {
    const conversion = await attemptConversion(["doom.mp4"], Formats.MP4, Formats.GIF);

    expect(conversion).toBeTruthy();
    expect(conversion!.path.map((c) => c.format.mime)).toEqual(["video/mp4", "image/gif"]);
    expect(conversion!.path.at(-1)!.handler.name).toBe("FFmpeg");
  },
  { timeout: 120000 },
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

/**
 * Converts an input that is made inside the page, and describes the single output from there
 * (byte arrays don't survive the trip out of the page).
 * @param input Text, or `"photo"` for a noisy JPEG, `"photo-low"` for the same at low quality,
 * `"photo-exif"` for the same with an EXIF block, `"words"` for a PNG of black text on white,
 * `"words-pdf"` for that PNG as a PDF, `"two-pdfs"` for two of those PDFs, `"disc"` for a PNG of
 * a dark disc on white.
 */
function convertGenerated(
  input: string,
  from: Pick<FileFormat, "mime" | "format">,
  to: Pick<FileFormat, "mime" | "format">,
  settings?: ConversionSettings,
) {
  return page.evaluate(
    async (input, from, to, settings) => {
      const canvas = new OffscreenCanvas(600, 200);
      const ctx = canvas.getContext("2d")!;
      const toBytes = async (type: string, quality = 1) =>
        new Uint8Array(await (await canvas.convertToBlob({ type, quality })).arrayBuffer());

      let bytes = new TextEncoder().encode(input);
      if (input.startsWith("photo")) {
        const pixels = ctx.createImageData(600, 200);
        for (let i = 0; i < pixels.data.length; i++)
          pixels.data[i] = i % 4 === 3 ? 255 : (i * 7) % 256;
        ctx.putImageData(pixels, 0, 0);
        bytes = await toBytes("image/jpeg", input === "photo-low" ? 0.2 : 1);
        if (input === "photo-exif") {
          // an APP1 segment right after the start marker: "Exif", then an empty big-endian TIFF
          const exif = [0xff, 0xe1, 0, 22, ...new TextEncoder().encode("Exif\0\0MM\0*")];
          exif.push(0, 0, 0, 8, 0, 0, 0, 0, 0, 0);
          bytes = new Uint8Array([...bytes.slice(0, 2), ...exif, ...bytes.slice(2)]);
        }
      } else if (input !== "disc" && (input.startsWith("words") || input === "two-pdfs")) {
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, 600, 200);
        ctx.fillStyle = "black";
        ctx.font = "64px sans-serif";
        ctx.fillText("Convert 2026", 40, 120);
        bytes = await toBytes("image/png");
      } else if (input === "disc") {
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, 600, 200);
        ctx.fillStyle = "black";
        ctx.arc(300, 100, 80, 0, 2 * Math.PI);
        ctx.fill();
        bytes = await toBytes("image/png");
      }

      const files = [{ name: "input", bytes }];
      if (input === "words-pdf" || input === "two-pdfs") {
        const pdf = await window.tryConvertByTraversing(
          files,
          { ...from, format: { ...from.format, mime: "image/png", format: "png" } },
          from,
        );
        if (!pdf) throw new Error("could not make the input PDF");
        bytes = pdf.files[0].bytes;
        files[0] = { name: "input.pdf", bytes };
        if (input === "two-pdfs") files.push({ name: "second.pdf", bytes: bytes.slice() });
      }

      // converting hands the buffer to a worker, which empties this array
      const inputSize = bytes.length;
      const result = await window.tryConvertByTraversing(files, from, to, undefined, settings);
      if (!result) return null;

      const output = result.files[0].bytes;
      const description = {
        handlers: result.path.map((c) => c.handler.name as string),
        inputSize,
        outputSize: output.length,
        outputCount: result.files.length,
        text: new TextDecoder().decode(output.slice(0, 4096)),
        hasExif: /Exif|eXIf/.test(new TextDecoder("latin1").decode(output)),
        width: 0,
        cornerAlpha: -1,
        centreAlpha: -1,
      };
      try {
        const image = await createImageBitmap(new Blob([output as BlobPart]));
        canvas.width = image.width;
        canvas.height = image.height;
        ctx.drawImage(image, 0, 0);
        description.width = image.width;
        description.cornerAlpha = ctx.getImageData(2, 2, 1, 1).data[3];
        description.centreAlpha = ctx.getImageData(image.width / 2, image.height / 2, 1, 1).data[3];
      } catch {
        // not an image
      }
      return description;
    },
    input,
    { format: from, handler: dummyHandler },
    { format: to, handler: dummyHandler },
    settings,
  );
}

test(
  "jpeg → jpeg compresses instead of handing the file back",
  async () => {
    const output = await convertGenerated("photo", Formats.JPEG, Formats.JPEG, { quality: 30 });

    expect(output).toBeTruthy();
    expect(output!.handlers.at(-1)).toBe("ImageMagick");
    expect(output!.outputSize).toBeLessThan(output!.inputSize);
    expect(output!.width).toBe(600);
  },
  { timeout: 60000 },
);

test(
  "jpeg → jpeg keeps the original when compressing would enlarge it",
  async () => {
    const output = await convertGenerated("photo-low", Formats.JPEG, Formats.JPEG, {
      quality: 100,
    });

    expect(output).toBeTruthy();
    expect(output!.inputSize).toBeGreaterThan(1000);
    expect(output!.outputSize).toBe(output!.inputSize);
  },
  { timeout: 60000 },
);

test(
  "jpeg → jpeg scales down to the longest-side setting",
  async () => {
    const output = await convertGenerated("photo", Formats.JPEG, Formats.JPEG, { maxSize: 300 });

    expect(output).toBeTruthy();
    expect(output!.width).toBe(300);
  },
  { timeout: 60000 },
);

test(
  "mp4 → gif cuts and scales down to the trim and longest-side settings",
  async () => {
    const whole = await attemptConversion(["doom.mp4"], Formats.MP4, Formats.GIF);
    const clip = await attemptConversion(["doom.mp4"], Formats.MP4, Formats.GIF, {
      end: 0.5,
      maxSize: 64,
    });

    expect(whole).toBeTruthy();
    expect(clip).toBeTruthy();
    expect(clip!.size).toBeLessThan(whole!.size / 2);
  },
  { timeout: 120000 },
);

test(
  "the remove-metadata setting takes EXIF data out of a JPEG",
  async () => {
    const kept = await convertGenerated("photo-exif", Formats.JPEG, Formats.JPEG, { quality: 30 });
    const stripped = await convertGenerated("photo-exif", Formats.JPEG, Formats.JPEG, {
      stripMetadata: true,
    });
    const asPng = await convertGenerated("photo-exif", Formats.JPEG, Formats.PNG, {
      stripMetadata: true,
    });

    // without the setting the block survives, so its absence below is the setting's doing
    expect(kept!.hasExif).toBe(true);
    expect(stripped!.hasExif).toBe(false);
    expect(stripped!.width).toBe(600);
    expect(asPng!.hasExif).toBe(false);
  },
  { timeout: 60000 },
);

test(
  "mp4 → mp4 compresses through a media handler",
  async () => {
    const conversion = await attemptConversion(["doom.mp4"], Formats.MP4, Formats.MP4);

    expect(conversion).toBeTruthy();
    expect(["mediabunny", "FFmpeg"]).toContain(conversion!.path.at(-1)!.handler.name);
    expect(conversion!.files[0].name).toBe("doom.mp4");
  },
  { timeout: 120000 },
);

test(
  "pdf → ocr reads the text on a scanned page",
  async () => {
    const ocr = { ...Formats.TEXT, format: "ocr" };
    const output = await convertGenerated("words-pdf", Formats.PDF, ocr);

    expect(output).toBeTruthy();
    expect(output!.handlers.at(-1)).toBe("ocr");
    expect(output!.text).toContain("Convert 2026");
  },
  { timeout: 120000 },
);

test(
  "two pdfs → merged pdf gives one file",
  async () => {
    const merged = { ...Formats.PDF, format: "pdf-merged" };
    const output = await convertGenerated("two-pdfs", Formats.PDF, merged);

    expect(output).toBeTruthy();
    expect(output!.handlers).toEqual(["dummy", "mergePdf"]);
    expect(output!.outputCount).toBe(1);
    expect(output!.text.startsWith("%PDF")).toBe(true);
  },
  { timeout: 120000 },
);

test(
  "formats without a compressor have no same-format route",
  async () => {
    expect(await convertGenerated("plain text", Formats.TEXT, Formats.TEXT)).toBeNull();
  },
  { timeout: 60000 },
);

test(
  "html → html minifies",
  async () => {
    const html = "<p>\n  one   <b>two</b>\n  three\n</p>\n<!-- gone -->\n<pre>  kept  </pre>";
    const output = await convertGenerated(html, Formats.HTML, Formats.HTML);

    expect(output).toBeTruthy();
    expect(output!.handlers.at(-1)).toBe("minifyHtml");
    expect(output!.text).toContain("one <b>two</b> three");
    expect(output!.text).toContain("<pre>  kept  </pre>");
    expect(output!.text).not.toContain("gone");
  },
  { timeout: 60000 },
);

test(
  "png → ocr reads the text in the image",
  async () => {
    const output = await convertGenerated("words", Formats.PNG, { ...Formats.TEXT, format: "ocr" });

    expect(output).toBeTruthy();
    expect(output!.handlers.at(-1)).toBe("ocr");
    expect(output!.text).toContain("Convert 2026");
  },
  { timeout: 120000 },
);

test(
  "png → nobg makes the background transparent and keeps the subject",
  async () => {
    const output = await convertGenerated("disc", Formats.PNG, { ...Formats.PNG, format: "nobg" });

    expect(output).toBeTruthy();
    expect(output!.handlers.at(-1)).toBe("removeBg");
    expect(output!.cornerAlpha).toBeLessThan(40);
    expect(output!.centreAlpha).toBeGreaterThan(215);
  },
  { timeout: 120000 },
);

// ==================================================================
//                          END OF TESTS
// ==================================================================

afterAll(async () => {
  await browser.close();
  server.stop();
});
