import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

import Formats from "src/Formats.ts";
import { InitializationError } from "src/errors.ts";

import * as NBT from "nbtify";
import JSZip from "jszip";
import { changeExt, stripExt } from "src/common/index.ts";
import { compressGzip, decompressGzip } from "src/common/gzip.ts";
import { canvasToBlob, createCanvas, type CanvasBundle } from "src/common/canvas.ts";

const DEFAULT_WIDTH = 128;
const DEFAULT_HEIGHT = 128;
const ERROR_COLOR = [255, 0, 255, 255];

const base_colours = [
  [0, 0, 0, 0],
  [127, 178, 56, 255],
  [247, 233, 163, 255],
  [199, 199, 199, 255],
  [255, 0, 0, 255],
  [160, 160, 255, 255],
  [167, 167, 167, 255],
  [0, 124, 0, 255],
  [255, 255, 255, 255],
  [164, 168, 184, 255],
  [151, 109, 77, 255],
  [112, 112, 112, 255],
  [64, 64, 255, 255],
  [143, 119, 72, 255],
  [255, 252, 245, 255],
  [216, 127, 51, 255],
  [178, 76, 216, 255],
  [102, 153, 216, 255],
  [229, 229, 51, 255],
  [127, 204, 25, 255],
  [242, 127, 165, 255],
  [76, 76, 76, 255],
  [153, 153, 153, 255],
  [76, 127, 153, 255],
  [127, 63, 178, 255],
  [51, 76, 178, 255],
  [102, 76, 51, 255],
  [102, 127, 51, 255],
  [153, 51, 51, 255],
  [25, 25, 25, 255],
  [250, 238, 77, 255],
  [92, 219, 213, 255],
  [74, 128, 255, 255],
  [0, 217, 58, 255],
  [129, 86, 49, 255],
  [112, 2, 0, 255],
  [209, 177, 161, 255],
  [159, 82, 36, 255],
  [149, 87, 108, 255],
  [112, 108, 138, 255],
  [186, 133, 36, 255],
  [103, 117, 53, 255],
  [160, 77, 78, 255],
  [57, 41, 35, 255],
  [135, 107, 98, 255],
  [87, 92, 92, 255],
  [122, 73, 88, 255],
  [76, 62, 92, 255],
  [76, 50, 35, 255],
  [76, 82, 42, 255],
  [142, 60, 46, 255],
  [37, 22, 16, 255],
  [189, 48, 49, 255],
  [148, 63, 97, 255],
  [92, 25, 29, 255],
  [22, 126, 134, 255],
  [58, 142, 140, 255],
  [86, 44, 62, 255],
  [20, 180, 133, 255],
  [100, 100, 100, 255],
  [216, 175, 147, 255],
  [127, 167, 150, 255],
];

class mcMapHandler implements FormatHandler {
  public readonly name = "mcMap";
  public supportedFormats = [
    Formats.PNG.builder("png").fromTo(),
    Formats.RGB.builder("rgb").lossless().to(),
    Formats.MC_MAP.builder("mcmap").fromTo(),
    Formats.MC_MAP_GRID.builder("mcmap_grid").to(),
  ];
  public ready = false;

  #bundle?: CanvasBundle;

  async init() {
    this.#bundle = createCanvas(128, 128);

    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];

    if (!this.#bundle) {
      throw new InitializationError("Handler not initialized.");
    }
    const { canvas, ctx } = this.#bundle;

    if (inputFormat.mime === Formats.PNG.mime) {
      for (const file of inputFiles) {
        const fileName = stripExt(file.name);

        let startDigit = 0;

        // Check to see if user already renamed the file to correct format
        if (fileName.startsWith("map_")) {
          const after = fileName.split("_")[1];
          if (Number.isInteger(Number(after))) {
            startDigit = parseInt(after);
          }
        } else if (!Number.isNaN(Number(fileName))) {
          startDigit = parseInt(fileName);
        }

        const blob = new Blob([file.bytes as BlobPart], { type: inputFormat.mime });

        const image = await createImageBitmap(blob);

        if (outputFormat.internal === "mcmap_grid") {
          const zip = new JSZip();

          canvas.width = Math.ceil(image.width / 128) * 128;
          canvas.height = Math.ceil(image.height / 128) * 128;
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

          const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);

          const columns = Math.ceil(image.width / 128);
          const rows = Math.ceil(image.height / 128);

          const colours = mapRGBA2ColourIDs(pixels.data);

          for (let column = 0; column < columns; column++) {
            for (let row = 0; row < rows; row++) {
              const tile = new Uint8Array(128 * 128);

              for (let t = 0; t < 128; t++) {
                const tileOffset = 128 * (canvas.width * column + row);
                const start = canvas.width * t + tileOffset;
                const end = start + 128;

                tile.set(colours.subarray(start, end), 128 * t);
              }

              const data = await NBT.write(formatMapNBT(tile, 4671));

              zip.file(`map_${startDigit}.dat`, await compressGzip(data));

              startDigit++;
            }
          }

          const output = await zip.generateAsync({ type: "uint8array" });

          outputFiles.push({ bytes: output, name: "output.zip" });
        } else if (outputFormat.internal === "mcmap") {
          canvas.width = 128;
          canvas.height = 128;
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

          const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);

          let colours = mapRGBA2ColourIDs(pixels.data);

          const data = await NBT.write(formatMapNBT(colours, 4671));

          outputFiles.push({
            name: `map_${startDigit}.dat`,
            bytes: await compressGzip(data),
          });
        }
      }
    } else if (inputFormat.internal === "mcmap" && outputFormat.mime === Formats.PNG.mime) {
      for (const file of inputFiles) {
        const result = await decompressGzip(file.bytes);
        const nbt = await NBT.read(result);
        if (NBT.isTag<NBT.CompoundTag>(nbt.data)) {
          const data: NBT.CompoundTag = nbt.data;
          const mapdata = data["data"];
          if (NBT.isTag<NBT.CompoundTag>(mapdata)) {
            const width = NBT.isTag<NBT.IntTag>(mapdata["width"])
              ? mapdata["width"].valueOf()
              : DEFAULT_WIDTH;
            const height = NBT.isTag<NBT.IntTag>(mapdata["height"])
              ? mapdata["height"].valueOf()
              : DEFAULT_HEIGHT;
            const colors = NBT.isTag<NBT.ByteArrayTag>(mapdata["colors"])
              ? new Uint8Array(mapdata["colors"])
              : new Uint8Array([]);
            const rgba = map2rgba(colors, width, height);

            canvas.width = 128;
            canvas.height = 128;

            const image_data = new ImageData(new Uint8ClampedArray(rgba), 128, 128);

            ctx.putImageData(image_data, 0, 0);

            const bytes = await canvasToBlob(this.#bundle, outputFormat.mime);

            outputFiles.push({
              name: changeExt(file.name, outputFormat.extension),
              bytes: bytes,
            });
          }
        }
      }
    } else if (inputFormat.internal === "mcmap" && outputFormat.internal === "rgb") {
      for (const file of inputFiles) {
        try {
          const result = await decompressGzip(file.bytes);
          const nbt = await NBT.read(result);
          if (NBT.isTag<NBT.CompoundTag>(nbt.data)) {
            const data: NBT.CompoundTag = nbt.data;
            const mapdata = data["data"];
            if (NBT.isTag<NBT.CompoundTag>(mapdata)) {
              const width = NBT.isTag<NBT.IntTag>(mapdata["width"])
                ? mapdata["width"].valueOf()
                : DEFAULT_WIDTH;
              const height = NBT.isTag<NBT.IntTag>(mapdata["height"])
                ? mapdata["height"].valueOf()
                : DEFAULT_HEIGHT;
              const colors = NBT.isTag<NBT.ByteArrayTag>(mapdata["colors"])
                ? new Uint8Array(mapdata["colors"])
                : new Uint8Array([]);
              const bytes = map2rgb(colors, width, height);
              outputFiles.push({
                name: changeExt(file.name, outputFormat.extension),
                bytes: new Uint8Array(bytes),
              });
            }
          }
        } catch (e) {
          console.error(e);
        }
      }
    } else {
      throw new TypeError(
        `Unsupported conversion path: ${inputFormat.internal} -> ${outputFormat.internal}`,
      );
    }
    return outputFiles;
  }
}

function map2rgb(colors: Uint8Array, width: number, height: number): number[] {
  const out: number[] = [];

  for (let i = 0; i < width * height; i++) {
    const color_id = colors[i];
    let color = color_id_to_rgb(color_id);

    if (color === null) {
      console.error(`Unknown color ID: ${color_id}.`);
      color = ERROR_COLOR;
    }

    out.push(...color);
  }

  return out;
}

function map2rgba(colors: Uint8Array, width: number, height: number): number[] {
  const out: number[] = [];

  for (let i = 0; i < width * height; i++) {
    const color_id = colors[i];
    let color = color_id_to_rgb(color_id);

    if (color === null) {
      console.error(`Unknown color ID: ${color_id}.`);
      color = ERROR_COLOR;
    }

    out.push(...color, 255);
  }

  return out;
}

function mapRGBA2ColourIDs(data: Uint8ClampedArray): Uint8Array {
  let colourIDs: Uint8Array = new Uint8Array(data.length / 4);

  let shades = getShades();

  for (let cursor = 0; cursor < data.length / 4; cursor++) {
    const closest_colour_match = getClosestColor(
      {
        R: data[cursor * 4],
        G: data[cursor * 4 + 1],
        B: data[cursor * 4 + 2],
        A: data[cursor * 4 + 3],
      },
      shades,
    );

    colourIDs[cursor] = shades.indexOf(closest_colour_match);
  }

  return colourIDs;
}

function color_id_to_rgb(id: number): number[] | null {
  const [base_id, shade_id] = [Math.floor(id / 4), id % 4];
  if (!(base_id in base_colours)) return null;

  let [r, g, b, _] = base_colours[base_id];

  let shade_mul = 0;
  if (shade_id === 0) shade_mul = 180;
  else if (shade_id === 1) shade_mul = 220;
  else if (shade_id === 2) shade_mul = 255;
  else if (shade_id === 3) shade_mul = 135;

  return [
    Math.floor((r * shade_mul) / 255),
    Math.floor((g * shade_mul) / 255),
    Math.floor((b * shade_mul) / 255),
  ];
}

function getShades() {
  const mappedColours = base_colours.map(([R, G, B, A]) => ({
    R,
    G,
    B,
    A,
  }));

  let shadeArray = [];

  for (const colour of mappedColours) {
    const shade1 = {
      R: Math.floor((colour.R * 180) / 255),
      G: Math.floor((colour.G * 180) / 255),
      B: Math.floor((colour.B * 180) / 255),
      A: colour.A,
    };
    const shade2 = {
      R: Math.floor((colour.R * 220) / 255),
      G: Math.floor((colour.G * 220) / 255),
      B: Math.floor((colour.B * 220) / 255),
      A: colour.A,
    };
    const shade3 = { R: colour.R, G: colour.G, B: colour.B, A: colour.A };
    const shade4 = {
      R: Math.floor((colour.R * 135) / 255),
      G: Math.floor((colour.G * 135) / 255),
      B: Math.floor((colour.B * 135) / 255),
      A: colour.A,
    };

    shadeArray.push(shade1, shade2, shade3, shade4);
  }

  return shadeArray;
}

function getClosestColor(to_check: any, available_colours: any) {
  return available_colours.reduce((previous: any, current: any) => {
    const previousDistance = Math.sqrt(
      (previous.R - to_check.R) ** 2 +
        (previous.G - to_check.G) ** 2 +
        (previous.B - to_check.B) ** 2,
    );
    const currentDistance = Math.sqrt(
      (current.R - to_check.R) ** 2 + (current.G - to_check.G) ** 2 + (current.B - to_check.B) ** 2,
    );
    return currentDistance < previousDistance ? current : previous;
  });
}

function formatMapNBT(colours: Uint8Array, dataVersion: number = 4671) {
  return {
    data: {
      scale: new NBT.Int32(0),
      dimension: "minecraft:overworld",
      trackingPosition: new NBT.Int32(0),
      unlimitedTracking: new NBT.Int32(0),
      locked: new NBT.Int32(1),
      xCenter: new NBT.Int32(0),
      width: new NBT.Int32(128),
      height: new NBT.Int32(128),
      zCenter: new NBT.Int32(0),
      colors: colours,
    },
    DataVersion: new NBT.Int32(dataVersion),
  };
}

export default mcMapHandler;
