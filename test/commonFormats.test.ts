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

// With ISOLATED=1 the build is served the way its real hosts serve it, cross-origin isolated,
// which switches FFmpeg, ONNX Runtime and OxiPNG to threads. Without it, as a host that sends
// no such headers would, before the service worker has taken over.
const headers: Record<string, string> = process.env.ISOLATED
  ? {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    }
  : {};

// Set up a basic webserver to host the distribution build
const server = Bun.serve({
  async fetch(req) {
    let path = new URL(req.url).pathname.replace("/convert/", "") || "index.html";
    path = path.replaceAll("..", "");
    if (path.startsWith("/test/")) path = "../test/resources/" + path.slice(6);
    const file = Bun.file(`${__dirname}/../dist/${path}`);
    if (!(await file.exists())) return new Response("Not Found", { status: 404 });
    return new Response(file, { headers });
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

const isolated = await page.evaluate(() => crossOriginIsolated);
console.log(`Setup finished, ${isolated ? "cross-origin isolated" : "not isolated"}.`);

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
 * a dark disc on white, `"disc-clear"` for that disc on a transparent background.
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
        if (input === "photo-make") {
          // an APP1 segment with one EXIF entry, Make = "Ack", short enough to sit in the entry
          const tiff = [..."MM\0*"].map((c) => c.charCodeAt(0));
          tiff.push(
            0,
            0,
            0,
            8,
            0,
            1,
            0x01,
            0x0f,
            0,
            2,
            0,
            0,
            0,
            4,
            0x41,
            0x63,
            0x6b,
            0,
            0,
            0,
            0,
            0,
          );
          const exif = [
            0xff,
            0xe1,
            0,
            2 + 6 + tiff.length,
            ...new TextEncoder().encode("Exif\0\0"),
          ];
          bytes = new Uint8Array([...bytes.slice(0, 2), ...exif, ...tiff, ...bytes.slice(2)]);
        }
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
      } else if (input.startsWith("disc")) {
        if (input === "disc") {
          ctx.fillStyle = "white";
          ctx.fillRect(0, 0, 600, 200);
        }
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
        cornerRed: -1,
        centreRed: -1,
      };
      try {
        const image = await createImageBitmap(new Blob([output as BlobPart]));
        canvas.width = image.width;
        canvas.height = image.height;
        ctx.drawImage(image, 0, 0);
        description.width = image.width;
        const corner = ctx.getImageData(2, 2, 1, 1).data;
        const centre = ctx.getImageData(image.width / 2, image.height / 2, 1, 1).data;
        [description.cornerRed, , , description.cornerAlpha] = corner;
        [description.centreRed, , , description.centreAlpha] = centre;
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
  "mp4 → mp4 with the copy setting cuts without re-encoding",
  async () => {
    const input = Bun.file(`${__dirname}/resources/doom.mp4`).size;
    const copy = await attemptConversion(["doom.mp4"], Formats.MP4, Formats.MP4, {
      copyStreams: true,
      end: 1,
    });
    const pastTheEnd = await attemptConversion(["doom.mp4"], Formats.MP4, Formats.MP4, {
      copyStreams: true,
      start: 30,
    });

    expect(copy).toBeTruthy();
    // mediabunny is first in line for MP4, and it would re-encode
    expect(copy!.path.at(-1)!.handler.name).toBe("FFmpeg");
    expect(copy!.files.map((file) => file.name)).toEqual(["doom.mp4"]);
    // 1 of 2.4 seconds at the bitrate of the original; a re-encode comes out far smaller
    expect(copy!.size).toBeGreaterThan(input * 0.4);
    expect(copy!.size).toBeLessThan(input * 0.7);
    // an empty file is not a result
    expect(pastTheEnd).toBeNull();
  },
  { timeout: 120000 },
);

// a tetrahedron as an ASCII STL
const STL = `solid tetrahedron
${["0 0 0|0 1 0|1 0 0", "0 0 0|1 0 0|0 0 1", "0 0 0|0 0 1|0 1 0", "1 0 0|0 1 0|0 0 1"]
  .map(
    (facet) =>
      `facet normal 0 0 0\nouter loop\nvertex ${facet.replaceAll("|", "\nvertex ")}\nendloop\nendfacet`,
  )
  .join("\n")}
endsolid tetrahedron`;

test(
  "stl → obj, glb, ply and usdz through the three.js exporters",
  async () => {
    const obj = await convertGenerated(STL, Formats.STL, Formats.OBJ);
    const glb = await convertGenerated(STL, Formats.STL, Formats.GLB);
    const ply = await convertGenerated(STL, Formats.STL, Formats.PLY);
    const usdz = await convertGenerated(STL, Formats.STL, Formats.USDZ);

    expect(obj!.handlers.at(-1)).toBe("threeModels");
    // four triangles, each with its own three corners
    expect(obj!.text.match(/^v /gm)).toHaveLength(12);
    expect(obj!.text.match(/^f /gm)).toHaveLength(4);
    expect(glb!.text.startsWith("glTF")).toBe(true);
    expect(ply!.text.startsWith("ply")).toBe(true);
    expect(ply!.text).toContain("element face 4");
    // a USDZ is a zip
    expect(usdz!.text.startsWith("PK")).toBe(true);
  },
  { timeout: 60000 },
);

test(
  "stl → png goes on from the model handler to the renderer",
  async () => {
    const image = await convertGenerated(STL, Formats.STL, Formats.PNG);

    expect(image!.handlers.slice(-2)).toEqual(["threeModels", "threejs"]);
    expect(image!.width).toBe(960);
  },
  { timeout: 60000 },
);

const SRT = "1\n00:00:01,000 --> 00:00:02,500\nHello\n\n2\n00:00:03,000 --> 00:00:04,000\nWorld\n";

test(
  "srt ↔ vtt and srt → ass keep the cues and their times",
  async () => {
    const vtt = await convertGenerated(SRT, Formats.SRT, Formats.VTT);
    const ass = await convertGenerated(SRT, Formats.SRT, Formats.ASS);
    const back = await convertGenerated(vtt!.text, Formats.VTT, Formats.SRT);

    expect(vtt!.handlers.at(-1)).toBe("subtitles");
    expect(vtt!.text.startsWith("WEBVTT")).toBe(true);
    expect(vtt!.text).toContain("00:01.000 --> 00:02.500\nHello");
    expect(ass!.text).toContain("[Script Info]");
    expect(ass!.text).toMatch(/Dialogue: .*0:00:03\.00,0:00:04\.00.*World/);
    expect(back!.text).toContain("00:00:03,000 --> 00:00:04,000\nWorld");
  },
  { timeout: 60000 },
);

test(
  "png → hdr uses a format ImageMagick has no MIME type for",
  async () => {
    const hdr = await convertGenerated("words", Formats.PNG, {
      mime: "image/x-hdr",
      format: "hdr",
    });

    expect(hdr!.handlers.at(-1)).toBe("ImageMagick");
    expect(hdr!.text.startsWith("#?RADIANCE")).toBe(true);
  },
  { timeout: 60000 },
);

// one textured triangle as Collada; the texture is a file that does not exist
const DAE = `<?xml version="1.0"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
<asset><up_axis>Y_UP</up_axis></asset>
<library_images><image id="img"><init_from>missing.png</init_from></image></library_images>
<library_effects><effect id="fx"><profile_COMMON>
<newparam sid="surf"><surface type="2D"><init_from>img</init_from></surface></newparam>
<newparam sid="samp"><sampler2D><source>surf</source></sampler2D></newparam>
<technique sid="common"><lambert><diffuse><texture texture="samp" texcoord="UV"/></diffuse></lambert></technique>
</profile_COMMON></effect></library_effects>
<library_materials><material id="mat"><instance_effect url="#fx"/></material></library_materials>
<library_geometries><geometry id="geo"><mesh>
<source id="pos"><float_array id="pos-a" count="9">0 0 0 1 0 0 0 1 0</float_array><technique_common><accessor source="#pos-a" count="3" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>
<source id="uv"><float_array id="uv-a" count="6">0 0 1 0 0 1</float_array><technique_common><accessor source="#uv-a" count="3" stride="2"><param name="S" type="float"/><param name="T" type="float"/></accessor></technique_common></source>
<vertices id="vtx"><input semantic="POSITION" source="#pos"/></vertices>
<triangles count="1" material="m"><input semantic="VERTEX" source="#vtx" offset="0"/><input semantic="TEXCOORD" source="#uv" offset="1" set="0"/><p>0 0 1 1 2 2</p></triangles>
</mesh></geometry></library_geometries>
<library_visual_scenes><visual_scene id="scene"><node id="n"><instance_geometry url="#geo"><bind_material><technique_common><instance_material symbol="m" target="#mat"/></technique_common></bind_material></instance_geometry></node></visual_scene></library_visual_scenes>
<scene><instance_visual_scene url="#scene"/></scene>
</COLLADA>`;

test(
  "dae → glb converts directly when a texture file is missing",
  async () => {
    const glb = await convertGenerated(DAE, Formats.DAE, Formats.GLB);

    expect(glb!.text.startsWith("glTF")).toBe(true);
    // one step: an exporter that gave up on the texture would send this through OBJ, without materials
    expect(glb!.handlers.slice(1)).toEqual(["threeModels"]);
  },
  { timeout: 60000 },
);

test(
  "csv → xlsx and vcf → csv use the spreadsheet and contact handlers",
  async () => {
    const xlsx = await convertGenerated("name,total\nAnna,12", Formats.CSV, Formats.XLSX);
    const vcard = "BEGIN:VCARD\nFN:Anna de Vries\nEMAIL:anna@example.com\nEND:VCARD\n";
    const csv = await convertGenerated(vcard, Formats.VCF, Formats.CSV);

    expect(xlsx!.handlers.at(-1)).toBe("sheetjs");
    // an XLSX is a zip
    expect(xlsx!.text.startsWith("PK")).toBe(true);
    // contacts go to JSON first, and the JSON handler makes the table
    expect(csv!.handlers.slice(1)).toEqual(["vcard", "fromJson"]);
    expect(csv!.text.split("\n")[0]).toContain("Name,");
    expect(csv!.text).toContain("Anna de Vries");
    expect(csv!.text).toContain("anna@example.com");
  },
  { timeout: 60000 },
);

// headless Chrome has WebGPU on a developer's machine, and usually none on a CI runner
const hasWebGpu = await page.evaluate(async () => !!(await navigator.gpu?.requestAdapter()));

test.skipIf(!hasWebGpu)(
  "png → upscaled png is twice the size and keeps transparency",
  async () => {
    const photo = await convertGenerated("words", Formats.PNG, {
      mime: "image/png",
      format: "upscaled-photo",
    });
    const drawing = await convertGenerated("disc-clear", Formats.PNG, {
      mime: "image/png",
      format: "upscaled-drawing",
    });

    expect(photo!.handlers.at(-1)).toBe("upscale");
    expect(photo!.width).toBe(1200);
    // still a white page: a network that drew nothing would leave it black
    expect(photo!.cornerRed).toBeGreaterThan(240);
    expect(drawing!.width).toBe(1200);
    // the disc is still dark and opaque, and what was transparent around it still is
    expect(drawing!.centreRed).toBeLessThan(30);
    expect(drawing!.centreAlpha).toBe(255);
    expect(drawing!.cornerAlpha).toBe(0);
  },
  { timeout: 120000 },
);

test.skipIf(!hasWebGpu)(
  "mp4 → upscaled mp4 doubles the frame and keeps the length",
  async () => {
    const result = await page.evaluate(
      async (from, to) => {
        const bytes = await fetch("/test/doom.mp4").then((r) => r.bytes());
        const files = [{ name: "doom.mp4", bytes }];
        const output = await window.tryConvertByTraversing(files, from, to);
        if (!output) return null;
        // Opens a video and measures the brightness of its frame at one second. Declared in
        // here because this function runs in the page, where nothing outside it exists.
        // oxlint-disable-next-line unicorn/consistent-function-scoping
        const inspect = async (data: Uint8Array) => {
          const video = document.createElement("video");
          video.muted = true;
          video.src = URL.createObjectURL(new Blob([data as BlobPart]));
          const once = (event: string) =>
            new Promise((resolve, reject) => {
              video.addEventListener(event, resolve, { once: true });
              video.addEventListener("error", () => reject(new Error("the video does not play")));
            });
          await once("loadedmetadata");
          video.currentTime = 1;
          await once("seeked");
          const canvas = new OffscreenCanvas(32, 20);
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(video, 0, 0, 32, 20);
          const pixels = ctx.getImageData(0, 0, 32, 20).data;
          const brightness = pixels.reduce((sum, value) => sum + value, 0) / pixels.length;
          return {
            width: video.videoWidth,
            height: video.videoHeight,
            duration: video.duration,
            brightness,
          };
        };
        const original = await inspect(await fetch("/test/doom.mp4").then((r) => r.bytes()));
        return {
          name: output.files[0].name,
          handler: output.path.at(-1)!.handler.name as string,
          original: original.brightness,
          ...(await inspect(output.files[0].bytes)),
        };
      },
      { format: Formats.MP4, handler: dummyHandler } as never,
      {
        format: { mime: "video/mp4", format: "upscaled-film" },
        handler: dummyHandler,
      } as never,
    );

    // doom.mp4 is 320 × 200 and 2.4 seconds long
    expect(result).toMatchObject({
      name: "doom-2x.mp4",
      handler: "upscaleVideo",
      width: 640,
      height: 400,
    });
    expect(result!.duration).toBeCloseTo(2.4, 0);
    // the same picture, only larger: frames that came out black or blank would not be as bright
    expect(Math.abs(result!.brightness - result!.original)).toBeLessThan(12);
    expect(result!.brightness).toBeGreaterThan(20);
  },
  { timeout: 180000 },
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
  "mp4 → mp4 respects the longest side setting",
  async () => {
    // a limit above the video's size changes nothing, but both runs skip the keep-smaller swap
    const full = await attemptConversion(["doom.mp4"], Formats.MP4, Formats.MP4, {
      maxSize: 10000,
    });
    const small = await attemptConversion(["doom.mp4"], Formats.MP4, Formats.MP4, { maxSize: 64 });

    expect(full).toBeTruthy();
    expect(small).toBeTruthy();
    expect(small!.size).toBeLessThan(full!.size);
  },
  { timeout: 240000 },
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

/** Converts one of the files in test/resources and describes the first output. */
function convertResource(
  name: string,
  from: Pick<FileFormat, "mime" | "format">,
  to: Pick<FileFormat, "mime" | "format">,
  settings?: ConversionSettings,
) {
  return page.evaluate(
    async (name, from, to, settings) => {
      const bytes = await fetch("/test/" + name).then((r) => r.bytes());
      const inputSize = bytes.length;
      const result = await window.tryConvertByTraversing(
        [{ name, bytes }],
        from,
        to,
        undefined,
        settings,
      );
      if (!result) return null;
      const output = result.files[0];
      return {
        handlers: result.path.map((c) => c.handler.name as string),
        name: output.name,
        inputSize,
        outputSize: output.bytes.length,
        text: new TextDecoder("latin1").decode(output.bytes),
      };
    },
    name,
    { format: from, handler: dummyHandler },
    { format: to, handler: dummyHandler },
    settings,
  );
}

test(
  "mp3 → audio check reports a verdict, loudness and a spectrogram",
  async () => {
    const output = await convertResource("gaster.mp3", Formats.MP3, {
      ...Formats.HTML,
      format: "audio-check",
    });

    expect(output!.handlers).toEqual(["dummy", "audioCheck"]);
    const json = /<script type="application\/json" id="audio-check">(.*?)<\/script>/s.exec(
      output!.text,
    )![1];
    const [summary] = JSON.parse(json);
    expect(summary.format).toContain("MP3");
    expect(["ok", "note", "warn", "bad"]).toContain(summary.level);
    expect(summary.verdict.length).toBeGreaterThan(0);
    // what `ffmpeg -af ebur128=peak=true` reads, with and without cross-origin isolation, where
    // the meter reports through shared memory instead of messages
    expect(summary.loudness.lufs).toBeCloseTo(-17.4, 0);
    expect(summary.loudness.truePeak).toBeCloseTo(-5.6, 0);
    expect(summary.spectrogram).toStartWith("data:image/png;base64,");
  },
  { timeout: 120000 },
);

test(
  "mp4 → contact sheet is one PNG of 4 × 4 stills",
  async () => {
    const output = await convertResource("doom.mp4", Formats.MP4, {
      ...Formats.PNG,
      format: "contact-sheet",
    });

    expect(output!.handlers.at(-1)).toBe("contactSheet");
    expect(output!.name).toBe("doom-contact-sheet.png");
    expect(output!.text.slice(1, 4)).toBe("PNG");
  },
  { timeout: 120000 },
);

test(
  "mp3 → make a video gives an MP4",
  async () => {
    const output = await convertResource("gaster.mp3", Formats.MP3, {
      ...Formats.MP4,
      format: "audio-video",
    });

    expect(output!.handlers.at(-1)).toBe("audioVideo");
    expect(output!.text.slice(4, 8)).toBe("ftyp");
  },
  { timeout: 300000 },
);

/** Sample-rate bits and channel mode of the first MPEG audio frame, after any ID3 tag. */
function mp3Header(bytes: Uint8Array) {
  let at = 0;
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    // the tag size is "syncsafe": seven bits per byte
    at = 10 + ((bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9]);
  }
  while (!(bytes[at] === 0xff && (bytes[at + 1] & 0xe0) === 0xe0)) at++;
  return { rate: (bytes[at + 2] >> 2) & 3, mono: bytes[at + 3] >> 6 === 3 };
}

test(
  "mp3 → mp3 with audio edits goes through FFmpeg and keeps the sample rate",
  async () => {
    const edited = await convertResource("gaster.mp3", Formats.MP3, Formats.MP3, {
      normalize: true,
      fadeIn: 0.5,
      fadeOut: 0.5,
      mono: true,
    });

    expect(edited!.handlers.at(-1)).toBe("FFmpeg");
    const before = mp3Header(await Bun.file(`${__dirname}/resources/gaster.mp3`).bytes());
    const after = mp3Header(Uint8Array.from(edited!.text, (c) => c.charCodeAt(0)));
    // loudnorm would hand on 192 kHz if the handler didn't ask for the input's rate
    expect(after.rate).toBe(before.rate);
    expect(after.mono).toBe(true);
  },
  { timeout: 120000 },
);

test(
  "jpeg → png with fewer colours quantises in ImageMagick and comes out smaller",
  async () => {
    const full = await convertGenerated("photo", Formats.JPEG, Formats.PNG);
    const fewer = await convertGenerated("photo", Formats.JPEG, Formats.PNG, { colors: 16 });

    // canvasToBlob can't write a palette, so the route goes on to ImageMagick
    expect(fewer!.handlers.at(-1)).toBe("ImageMagick");
    expect(fewer!.outputSize).toBeLessThan(full!.outputSize / 2);
  },
  { timeout: 120000 },
);

test(
  "png → png with fewer colours keeps the original when that is smaller",
  async () => {
    const output = await convertResource("colors_50x50.png", Formats.PNG, Formats.PNG, {
      colors: 8,
    });

    expect(output!.outputSize).toBeLessThanOrEqual(output!.inputSize);
  },
  { timeout: 120000 },
);

test(
  "a batch of mp3s with audio edits gives one edited file per input",
  async () => {
    const result = await page.evaluate(
      async (from, to) => {
        const bytes = await fetch("/test/gaster.mp3").then((r) => r.bytes());
        const files = [
          { name: "a.mp3", bytes },
          { name: "b.mp3", bytes: bytes.slice() },
        ];
        const settings = { fadeIn: 0.5, speed: 1.5, reverse: true, trimSilence: true };
        const output = await window.tryConvertByTraversing(files, from, to, undefined, settings);
        return (
          output && {
            names: output.files.map((f) => f.name),
            handler: output.path.at(-1)!.handler.name,
          }
        );
      },
      { format: Formats.MP3, handler: dummyHandler },
      { format: Formats.MP3, handler: dummyHandler },
    );

    expect(result!.handler).toBe("FFmpeg");
    expect(result!.names).toEqual(["a.mp3", "b.mp3"]);
  },
  { timeout: 120000 },
);

test(
  "a batch of pngs with fewer colours gives one file per input",
  async () => {
    const result = await page.evaluate(
      async (from, to) => {
        const bytes = await fetch("/test/colors_50x50.png").then((r) => r.bytes());
        const files = [
          { name: "a.png", bytes },
          { name: "b.png", bytes: bytes.slice() },
        ];
        const output = await window.tryConvertByTraversing(files, from, to, undefined, {
          colors: 4,
        });
        return output && output.files.map((f) => f.name);
      },
      { format: Formats.PNG, handler: dummyHandler },
      { format: Formats.PNG, handler: dummyHandler },
    );

    expect(result).toEqual(["a.png", "b.png"]);
  },
  { timeout: 120000 },
);

test(
  "png → favicon set gives a zip",
  async () => {
    const output = await convertGenerated("disc", Formats.PNG, {
      ...Formats.ZIP,
      format: "favicon",
    });

    expect(output!.handlers.at(-1)).toBe("favicon");
    expect(output!.text.slice(0, 2)).toBe("PK");
    // the first file in the zip; the description holds the first 4 KB
    expect(output!.text).toContain("favicon.ico");
  },
  { timeout: 60000 },
);

const png = (format: string) => ({ ...Formats.PNG, format });

test(
  "png → framed, halftone and depth keep the picture's size or frame it",
  async () => {
    const framed = await convertGenerated("disc", Formats.PNG, png("framed"));
    // 8 % of the longest side around a 600 × 200 picture
    expect(framed!.handlers.at(-1)).toBe("frame");
    expect(framed!.width).toBe(600 + 2 * 48);

    const print = await convertGenerated("disc", Formats.PNG, png("halftone"));
    expect(print!.handlers.at(-1)).toBe("halftone");
    expect(print!.width).toBe(600);
    // the white edge is bare paper, the black disc is covered in ink
    expect(print!.cornerRed).toBe(0xf1);
    expect(print!.centreRed).toBeLessThan(0xf1);

    const depth = await convertGenerated("disc", Formats.PNG, png("depth"));
    expect(depth!.handlers.at(-1)).toBe("depth");
    expect(depth!.width).toBe(600);
    expect(depth!.cornerAlpha).toBe(255);
  },
  { timeout: 180000 },
);

test(
  "two pngs → collage gives one picture with both side by side",
  async () => {
    const result = await page.evaluate(
      async (from, to) => {
        const bytes = await fetch("/test/colors_50x50.png").then((r) => r.bytes());
        const files = [
          { name: "a.png", bytes },
          { name: "b.png", bytes: bytes.slice() },
        ];
        const output = await window.tryConvertByTraversing(files, from, to);
        if (!output) return null;
        const image = await createImageBitmap(new Blob([output.files[0].bytes as BlobPart]));
        return {
          count: output.files.length,
          name: output.files[0].name,
          width: image.width,
          height: image.height,
        };
      },
      { format: Formats.PNG, handler: dummyHandler },
      { format: { ...Formats.PNG, format: "collage" }, handler: dummyHandler } as never,
    );

    // two cells of 50 with gaps of 8 between and around them
    expect(result).toEqual({ count: 1, name: "a-collage.png", width: 124, height: 66 });
  },
  { timeout: 60000 },
);

test(
  "png → ascii art in colour gives an HTML page",
  async () => {
    const output = await convertGenerated("disc", Formats.PNG, {
      ...Formats.HTML,
      format: "ascii-html",
    });

    expect(output!.handlers.at(-1)).toBe("asciiHtml");
    expect(output!.text).toStartWith("<!DOCTYPE html>");
    expect(output!.text).toContain('<span style="color:#');
  },
  { timeout: 60000 },
);

test(
  "a watermark is stamped on a picture, also when it stays a PNG",
  async () => {
    const plain = await convertGenerated("disc", Formats.PNG, Formats.JPEG);
    const stamped = await convertGenerated("disc", Formats.PNG, Formats.JPEG, {
      watermark: "CONVERT TO IT",
    });
    expect(plain!.centreRed).toBeLessThan(20);
    // light grey letters over the middle of the black disc
    expect(stamped!.centreRed).toBeGreaterThan(plain!.centreRed + 20);

    const png = await convertGenerated("disc", Formats.PNG, Formats.PNG, {
      watermark: "CONVERT TO IT",
    });
    expect(png!.handlers.at(-1)).toBe("ImageMagick");
    expect(png!.centreRed).toBeGreaterThan(20);
  },
  { timeout: 120000 },
);

test(
  "mermaid → svg draws the diagram at its own size",
  async () => {
    const output = await convertGenerated(
      "graph TD\n  A[Start] --> B[Done]\n",
      Formats.MERMAID,
      Formats.SVG,
    );

    expect(output!.handlers).toEqual(["dummy", "mermaid"]);
    expect(output!.text).toMatch(/^<svg[^>]* width="[\d.]+" height="[\d.]+"/);
  },
  { timeout: 120000 },
);

test(
  "mermaid → svg → png draws the diagram",
  async () => {
    const output = await convertGenerated(
      "graph TD\n  A[Start] --> B[Done]\n",
      Formats.MERMAID,
      Formats.PNG,
    );

    expect(output).toBeTruthy();
    expect(output!.handlers).toContain("mermaid");
    expect(output!.width).toBeGreaterThan(20);
  },
  { timeout: 120000 },
);

test(
  "json → typescript describes the shape",
  async () => {
    const output = await convertGenerated(
      '{"id":1,"tags":["a"]}',
      Formats.JSON,
      Formats.TYPESCRIPT,
    );

    expect(output!.handlers.at(-1)).toBe("jsonToTs");
    expect(output!.text).toContain("export interface");
    expect(output!.text).toContain("  tags: string[];");
  },
  { timeout: 60000 },
);

test(
  "mp3 → metadata report has the tags, the stream and the tempo",
  async () => {
    const output = await convertResource("gaster.mp3", Formats.MP3, {
      ...Formats.JSON,
      format: "metadata",
    });

    expect(output!.handlers.at(-1)).toBe("metadata");
    expect(output!.name).toBe("gaster-metadata.json");
    const report = JSON.parse(output!.text);
    expect(report.format.codec).toContain("MPEG");
    expect(report.format.duration).toBeCloseTo(2.3, 1);
    // too short for a tempo, which the unit tests check on longer click tracks
    expect(report.bpm).toBeUndefined();
  },
  { timeout: 120000 },
);

test(
  "png → metadata report has the size and properties",
  async () => {
    const output = await convertGenerated("disc", Formats.PNG, {
      ...Formats.JSON,
      format: "metadata",
    });

    expect(output!.handlers.at(-1)).toBe("metadata");
    const report = JSON.parse(output!.text);
    expect([report.width, report.height]).toEqual([600, 200]);
    expect(Object.keys(report.properties).length).toBeGreaterThan(0);
  },
  { timeout: 120000 },
);

test(
  "mp4 at speed 2 plays in half the time",
  async () => {
    const result = await page.evaluate(
      async (from, to) => {
        const bytes = await fetch("/test/doom.mp4").then((r) => r.bytes());
        const output = await window.tryConvertByTraversing(
          [{ name: "doom.mp4", bytes }],
          from,
          to,
          undefined,
          { speed: 2 },
        );
        if (!output) return null;
        const video = document.createElement("video");
        video.src = URL.createObjectURL(new Blob([output.files[0].bytes as BlobPart]));
        await new Promise((resolve) => video.addEventListener("loadedmetadata", resolve));
        return { handler: output.path.at(-1)!.handler.name as string, duration: video.duration };
      },
      { format: Formats.MP4, handler: dummyHandler },
      { format: Formats.MP4, handler: dummyHandler },
    );

    expect(result!.handler).toBe("FFmpeg");
    // doom.mp4 is 2.4 seconds at 10 frames a second, and keeps that rate: half the time, give or
    // take the two frames that native FFmpeg also lands on (1.4 seconds)
    expect(result!.duration).toBeGreaterThan(1.1);
    expect(result!.duration).toBeLessThan(1.5);
  },
  { timeout: 120000 },
);

test(
  "tiffs go through the picture tools one by one, or together into a collage",
  async () => {
    const result = await page.evaluate(
      async (png, tiff, collage, halftone) => {
        const bytes = await fetch("/test/colors_50x50.png").then((r) => r.bytes());
        const made = await window.tryConvertByTraversing([{ name: "a.png", bytes }], png, tiff);
        if (!made) return null;
        const tiffs = () =>
          ["a.tiff", "b.tiff", "c.tiff"].map((name) => ({
            name,
            bytes: made.files[0].bytes.slice(),
          }));
        // declared in here because this function runs in the page
        // oxlint-disable-next-line unicorn/consistent-function-scoping
        const sizes = async (output: { files: FileData[] } | null) =>
          output &&
          Promise.all(
            output.files.map(async (file) => {
              const image = await createImageBitmap(new Blob([file.bytes as BlobPart]));
              return `${file.name} ${image.width}x${image.height}`;
            }),
          );
        return {
          collage: await sizes(
            await window.tryConvertByTraversing(tiffs().slice(0, 2), tiff, collage),
          ),
          halftone: await sizes(await window.tryConvertByTraversing(tiffs(), tiff, halftone)),
        };
      },
      { format: Formats.PNG, handler: dummyHandler },
      { format: Formats.TIFF, handler: dummyHandler },
      { format: { ...Formats.PNG, format: "collage" }, handler: dummyHandler } as never,
      { format: { ...Formats.PNG, format: "halftone" }, handler: dummyHandler } as never,
    );

    expect(result!.collage).toEqual(["a-collage.png 124x66"]);
    expect(result!.halftone).toEqual([
      "a-halftone.png 50x50",
      "b-halftone.png 50x50",
      "c-halftone.png 50x50",
    ]);
  },
  { timeout: 120000 },
);

test(
  "jpeg → metadata report has its EXIF",
  async () => {
    const output = await convertGenerated("photo-make", Formats.JPEG, {
      ...Formats.JSON,
      format: "metadata",
    });

    expect(output!.handlers.at(-1)).toBe("metadata");
    expect(JSON.parse(output!.text).properties["exif:Make"]).toBe("Ack");
  },
  { timeout: 120000 },
);

test(
  "mp4 → metadata report describes the video",
  async () => {
    const output = await convertResource("doom.mp4", Formats.MP4, {
      ...Formats.JSON,
      format: "metadata",
    });

    const report = JSON.parse(output!.text);
    expect(report.format.duration).toBeCloseTo(2.4, 1);
    expect(report.bpm).toBeUndefined();
  },
  { timeout: 120000 },
);

test(
  "a song's metadata report has its tempo",
  async () => {
    const output = await convertResource("click-120bpm.mp3", Formats.MP3, {
      ...Formats.JSON,
      format: "metadata",
    });

    const { bpm } = JSON.parse(output!.text);
    expect(Math.abs(bpm - 120)).toBeLessThan(2);
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
