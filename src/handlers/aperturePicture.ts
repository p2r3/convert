import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats from "src/CommonFormats.ts";

class aperturePictureHandler implements FormatHandler {
  public name: string = "aperturePicture";
  public supportedFormats?: FileFormat[];
  public ready: boolean = false;

  async init() {
    this.supportedFormats = [
      {
        name: "Aperture Picture Format",
        format: "apf",
        extension: "apf",
        mime: "image/x-aperture-picture",
        from: true,
        to: false,
        internal: "apf",
        category: ["image"],
        lossless: true,
      },
      CommonFormats.BMP.builder("bmp")
        .allowFrom(false)
        .allowTo(true)
        .markLossless(),
    ];
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];
    const decoder = new TextDecoder();

    for (const file of inputFiles) {
      const text = decoder.decode(file.bytes);
      const lines = text.split(/\r?\n/);
      if (lines[0] !== "APERTURE IMAGE FORMAT (c) 1985")
        throw new Error("File is not an APF file");

      const SK = parseInt(lines[1]);
      const data = lines.slice(2).join("");
      const bitmap = decodeAPF(data, SK);
      const bmp = bitmapTo1BitBMP(bitmap, 320, 200);

      outputFiles.push({
        bytes: bmp,
        name: file.name.replace(/\.[^/.]+$/, "") + ".bmp",
      });
    }

    return outputFiles;
  }
}

function decodeAPF(data: string, SK: number): Uint8Array {
  const w = 320,
    h = 200;
  if (SK <= 0) throw new Error("Malformed APF file (SK is invalid, <= 0)");
  const bmp = new Uint8Array(w * h);
  let x = 0,
    y = h - 1,
    draw = true, // no idea how this works. the original basic code from the ARG sets draw to false and then inverts it and when i implemented that it kinda worked but the colour was inverted so i removed the draw  = !draw and it refused to draw anything so i just flipped this to true and now it works. i'm way too ill for this
    sn = 0;

  for (let i = 0; i < data.length; i++) { // this loop doesn't exactly match what the original basic script does but it should be cleaner. it went through a lot of iterations while i was trying to fix edge-cases so if anything looks off lmk
    let r = data.charCodeAt(i) - 32;
    draw = !draw;

    while (r > 0) {
      if (x >= w) {
        x = 0;
        y -= SK;
        if (y < 0) {
          sn++;
          y = h - 1 - sn;
        }
      }
      const run = Math.min(r, w - x);
      if (draw) bmp.fill(1, y * w + x, y * w + x + run);
      x += run;
      r -= run;
    }
  }
  return bmp;
}

function bitmapTo1BitBMP( // note i initially used 24-bit BMPs but the filesize was much larger for a b&w image so i decided to go with a 1-bit BMP. unfortunately this means the code to make it is much larger because i have to create a larger header for the colour palette and i have to do some bit shifting because of the nature of writing to bits instead of bytes whereas I could just write in a loop for 24-bit. worth it for the smaller file size though trust me
  bitmap: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const rowBytes = Math.ceil(width / 8);
  const paddedRowBytes = (rowBytes + 3) & ~3;
  const pixelArraySize = paddedRowBytes * height;
  const headerSize = 54 + 8;
  const fileSize = headerSize + pixelArraySize;
  const buf = new Uint8Array(fileSize);
  const view = new DataView(buf.buffer);

  buf[0] = 0x42;
  buf[1] = 0x4d;
  view.setUint32(2, fileSize, true);
  view.setUint32(10, headerSize, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 1, true);
  view.setUint32(34, pixelArraySize, true);

  buf[54] = 0;
  buf[55] = 0;
  buf[56] = 0;
  buf[57] = 0;
  buf[58] = 255;
  buf[59] = 255;
  buf[60] = 255;
  buf[61] = 0;

  let offset = headerSize;
  for (let y = height - 1; y >= 0; y--) {
    let byte = 0,
      bits = 0;
    const rowStart = y * width;
    for (let x = 0; x < width; x++) {
      byte = (byte << 1) | (bitmap[rowStart + x] ? 1 : 0);
      bits++;
      if (bits === 8) {
        buf[offset++] = byte;
        byte = 0;
        bits = 0;
      }
    }
    if (bits > 0) buf[offset++] = byte << (8 - bits);
    offset += paddedRowBytes - rowBytes;
  }

  return buf;
}

export default aperturePictureHandler;

// logical next step is to go from BMP to APF but that is far beyond my level of knowledge. if anyone wants to take a crack at it the original basic code is in the old ARG Wiki at http://portalwiki.asshatter.org/index.php/Aperture_Image_Format.html#GW-Basic_AMF.2FAPF_Viewer_Source
// if anyone wants to implement basic 1-bit colour, the .amf format is very simple, covered at http://portalwiki.asshatter.org/index.php/Aperture_Menu_Format.html. All you'd need to implement that is to check line 0 is APERTURE MENU FORMAT (c) 1985 and then line 1 is the colour info, comma separated. Idk what the RGB mappings for them are but the number meanings are at https://en.wikibooks.org/wiki/QBasic/Text_Output#Color_by_Number