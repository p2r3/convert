import { Font, Glyph, Path, parse } from "opentype.js";
import { SVGPathData } from "svg-pathdata";
import { compress, decompress} from 'woff2-encoder';
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats from 'src/CommonFormats.ts';

function escapeHtml(str: string) {
  const map = new Map<string, string>();
  map.set("&", "&amp;");
  map.set("<", "&lt;");
  map.set(">", "&gt;");
  map.set("\"", "&quot;");
  map.set("'", "&apos;");
  map.set("\n", "&#x0A;");
  return str.replace(/[&<>"'\n]/g, match => map.get(match)!);
}

function sfntToSvg(inputFile: FileData, encoder: TextEncoder) {
  const font = parse(inputFile.bytes.buffer);
  const unitsPerEm = font.unitsPerEm;
  const family = escapeHtml(font.names.fontFamily?.en || "ConvertedFont");

  const glyphElements: string[] = [];

  for (let i = 0; i < font.glyphs.length; i++) {
    const glyph = font.glyphs.get(i);
    if (!glyph || !glyph.unicode)
      continue;

    const path = glyph.getPath(0, 0, unitsPerEm);
    // flip Y axis, since svg fonts use a different coordinate system than ttf/otf
    path.commands.forEach(cmd => {
      if ("y" in cmd)
        cmd.y = -cmd.y;
      if ("y1" in cmd)
        cmd.y1 = -cmd.y1;
      if ("y2" in cmd)
        cmd.y2 = -cmd.y2;
    });
    const d = path.toPathData(5);
    
    glyphElements.push(`<glyph unicode="${escapeHtml(String.fromCharCode(glyph.unicode))}" glyph-name="${glyph.name || ""}" horiz-adv-x="${glyph.advanceWidth}" d="${d}"/>`);
  }

  // write svg font data & give a little demonstration of the font so that the SVG image isnt empty (and thus can [kind-of] be converted to things such as png, jpeg, etc)
  const svgFont = `<svg xmlns="http://www.w3.org/2000/svg">
  <defs>
    <font id="${escapeHtml(font.names.fullName?.en || "ConvertedFont")}"
        horiz-adv-x="${unitsPerEm}">
      <font-face
          font-family="${family}"
          style-name="Regular"
          units-per-em="${unitsPerEm}"
          ascent="${font.ascender}"
          descent="${font.descender}"
      />
      ${glyphElements.join("\n")}
    </font>
  </defs>

  <style>
    text {
      font-family: "${family}";
      font-size: 2em;
      fill: black;
    }
  </style>

  <text x="1em" y="1em">
    The quick brown fox jumps over the lazy dog.
  </text>
  <text x="1em" y="3em">
    ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz
  </text>
  <text x="1em" y="4.5em">
    0123456789 !@#$%^&amp;*() -=_+[]{};&apos;:&quot;,./&lt;&gt;?\\|\`~
  </text>
</svg>`;
      
  const name = inputFile.name.split(".")[0] + ".svg";
  const bytes = encoder.encode(svgFont);

  return { bytes, name };
}

function svgPathToOpenTypePath(d: string): Path {
  const path = new Path();

  const commands = new SVGPathData(d).toAbs().commands;

  for (const cmd of commands) {
    switch (cmd.type) {
      case SVGPathData.MOVE_TO:
        path.moveTo(cmd.x, cmd.y);
        break;

      case SVGPathData.LINE_TO:
        path.lineTo(cmd.x, cmd.y);
        break;

      case SVGPathData.CURVE_TO:
        path.curveTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y);
        break;

      case SVGPathData.QUAD_TO:
        path.quadraticCurveTo(cmd.x1, cmd.y1, cmd.x, cmd.y);
        break;

      case SVGPathData.CLOSE_PATH:
        path.close();
        break;
    }
  }

  return path;
}

function svgToOtf(inputFile: FileData, decoder: TextDecoder) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(decoder.decode(inputFile.bytes), "image/svg+xml");

  const fontFace = doc.querySelector("font-face");
  const fontEl = doc.querySelector("font");

  if (!fontFace || !fontEl)
    throw "Invalid SVG font format";

  const unitsPerEm = Number(fontFace.getAttribute("units-per-em")) || 1000;
  const ascent = Number(fontFace.getAttribute("ascent")) || 800;
  const descent = Number(fontFace.getAttribute("descent")) || -200;

  const glyphNodes = Array.from(doc.querySelectorAll("glyph"));

  const glyphs: Glyph[] = [];

  glyphs.push(
    new Glyph({
      name: ".notdef",
      unicode: undefined,
      advanceWidth: unitsPerEm / 2,
      path: new Path()
    })
  );

  for (const node of glyphNodes) {
    const unicodeAttr = node.getAttribute("unicode");
    const d = node.getAttribute("d");

    if (!unicodeAttr || !d)
      continue;

    const unicode = unicodeAttr.codePointAt(0);
    if (!unicode)
      continue;

    const advanceWidth =
      Number(node.getAttribute("horiz-adv-x")) || unitsPerEm;

    const path = svgPathToOpenTypePath(d);
    const glyphName = node.getAttribute("glyph-name");

    glyphs.push(
      new Glyph({
        name: glyphName ?? `uni${unicode.toString(16).toUpperCase()}`,
        unicode,
        advanceWidth,
        path
      })
    );
  }

  const font = new Font({
    familyName: fontFace.getAttribute("font-family") || "ConvertedFont",
    styleName: fontFace.getAttribute("style-name") || "Regular",
    unitsPerEm,
    ascender: ascent,
    descender: descent,
    glyphs
  });

  const bytes = new Uint8Array(font.toArrayBuffer());
  const name = inputFile.name.split(".")[0] + ".otf";

  return { bytes, name };
}

// opentype.js only supports writing CFF (OTF)
// this hangs on some woff2 font files; for some reason, opentype.js thinks that the tables array is massive (>200k items) when dealing with certain files
// to replicate, use DroidSansFallback.woff2 (found at https://github.com/GodotEngine/Godot/tree/master/thirdparty/fonts/DroidSansFallback.woff2) as input and select OTF as file output type
function sfntToOtf(inputFile: FileData) {
  const font = parse(inputFile.bytes.buffer);
  const bytes = new Uint8Array(font.toArrayBuffer());
  const name = inputFile.name.split(".")[0] + ".otf";

  return { bytes, name };
}

async function sfntToWoff2(inputFile: FileData): Promise<FileData> {
  const font = parse(inputFile.bytes.buffer);
  const sfnt = new Uint8Array(font.toArrayBuffer());

  const bytes = await compress(sfnt);

  const name =inputFile.name.split(".")[0] + ".woff2";

  return { bytes, name };
}

async function normalizeToSfnt(inputFile: FileData, inputFormat: FileFormat, decoder: TextDecoder): Promise<Uint8Array> {
  if (inputFormat.internal === "woff2")
    return await decompress(inputFile.bytes);
  else if (inputFormat.internal === "svg")
    return svgToOtf(inputFile, decoder).bytes;

  return inputFile.bytes;
}

class fontHandler implements FormatHandler {

  public name: string = "font";
  public supportedFormats?: FileFormat[];
  public ready: boolean = false;

  async init() {
    this.supportedFormats = [
      CommonFormats.TTF.builder("ttf").allowFrom().markLossless(),
      CommonFormats.OTF.builder("otf").allowFrom().allowTo().markLossless(),
      CommonFormats.WOFF.builder("woff").allowFrom().markLossless(),
      CommonFormats.WOFF2.builder("woff2").allowFrom().allowTo().markLossless(),
      CommonFormats.SVG.builder("svg").allowFrom().allowTo() // svg fonts lose a lot of font metadata, since they only convert the glyphs, so we can't mark it as lossless
    ];
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {
    if (outputFormat.internal !== "svg" && outputFormat.internal !== "otf" && outputFormat.internal !== "woff2") throw "Invalid output format.";

    const outputFiles: FileData[] = [];
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    for (const inputFile of inputFiles) {
      const nFile = { ...inputFile, bytes: await normalizeToSfnt(inputFile, inputFormat, decoder) };

      if (outputFormat.internal == "svg")
        outputFiles.push(sfntToSvg(nFile, encoder));
      else if (outputFormat.internal == "otf")
        outputFiles.push(sfntToOtf(nFile));
      else if (outputFormat.internal == "woff2")
        outputFiles.push(await sfntToWoff2(nFile));
    }
    return outputFiles;
  }
}

export default fontHandler;
