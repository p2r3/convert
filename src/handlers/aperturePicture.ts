import {
  initializeImageMagick,
  Magick,
  MagickFormat,
  MagickImageCollection,
  MagickReadSettings,
  MagickGeometry,
  QuantizeSettings
} from "@imagemagick/magick-wasm";

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
        to: true,
        internal: "apf",
        category: ["image"],
        lossless: true,
      },
      CommonFormats.BMP.builder("bmp")
        .allowFrom(true)
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

    if (inputFormat.internal === "apf") {
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
    }
    else if (inputFormat.internal === "bmp") { // we're just throwing science at the wall to see what sticks
      const w = 320,
        h = 200;
      await initializeImageMagick(); 

      const inputMagickFormat = inputFormat.internal as MagickFormat;
      const inputSettings = new MagickReadSettings();
      inputSettings.format = inputMagickFormat;

      for (const inputFile of inputFiles) {
        MagickImageCollection.use(fileCollection => {
          fileCollection.read(inputFile.bytes);
          for (const image of fileCollection) {
            if (!image) break;

            // this is to crush the image into 320x200 with 2 colors.
            image.resize(new MagickGeometry(320, 200));
            image.grayscale();
            const Qset = new QuantizeSettings();
            Qset.colors = 2;
            Qset.ditherMethod = 1; 
            image.quantize(Qset); // 2 colors

            let data = null // now you're thinking with NoneTypes
            image.getPixels(pixels => {
              data = pixels.toByteArray(0, 0, 320, 200, "r")
            });

            const apf = encodeAPF(data); // can we get some form of output?
            outputFiles.push({
              bytes: apf,
              name: inputFile.name.replace(/\.[^/.]+$/, "") + ".apf",
            });
            break
          };
        });
      };
    } else {
      throw new Error("Input not APF or BMP")
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

// split array into 200 arrays that are then reversed, converted into 255s and 0s, and turned back into 1 array
function APFarray(data: Uint8Array): Uint8Array {
  let newarray = [];
  let temparray = [];
  let pal = [];
  let ispalflipped = false;
  for (const b of data) {
    if (!pal.includes(b)) { // get used colors
      pal.push(b)
    }
    if (pal.length === 2) {
      break
    }
  }
  if (pal[0] > pal[1]) {
    ispalflipped = true
  }
  for (const b of data) {
    let uh = 0
    if (ispalflipped) {
      uh = (1-pal.indexOf(b))*255
    } else {
      uh = pal.indexOf(b)*255
    }
    temparray.push(uh)
    if (temparray.length === 320) {
      newarray.push(temparray)
      temparray = [] // clear temp array and add it to the new array
    }
  }

  let revarray = newarray.reverse().flat()
  return revarray;
}

function encodeAPF(data: Uint8Array): String {
  let apf = "APERTURE IMAGE FORMAT (c) 1985\n1\n" // header and ls of 1
  const q_data = APFarray(data);
  console.log(q_data)
  let runlen = 0
  let currun = 0

  for (const p of q_data) {
    if (p === currun) {
      runlen += 1
      if (runlen == 94) {runlen=0; apf += "~ "}
    } else {
      apf += String.fromCharCode(runlen+32)
      currun = p
      runlen = 1
    }
  }
  apf += String.fromCharCode(runlen+32);
  return apf;
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
