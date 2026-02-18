import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

import pako from "pako";
import * as NBT from "nbtify";

const DEFAULT_WIDTH = 128
const DEFAULT_HEIGHT = 128
const ERROR_COLOR = [255, 0, 255, 255]

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
]

class mcMapHandler implements FormatHandler {

    public name: string = "mcMap";
    public supportedFormats?: FileFormat[];
    public ready: boolean = false;

    async init() {
        this.supportedFormats = [
            {
                name: "RGB",
                format: "rgb",
                extension: "rgb",
                mime: "image/x-rgb",
                from: false,
                to: true,
                internal: "rgb",
                category: "image",
                lossless: true
            },
            {
                name: "Minecraft Map File",
                format: "mcmap",
                extension: "dat",
                mime: "application/x-minecraft-map", // I am required to put something here
                from: true,
                to: false,
                internal: "mcmap"
            },
        ];
        this.ready = true;
    }

    async doConvert(
        inputFiles: FileData[],
        inputFormat: FileFormat,
        outputFormat: FileFormat
    ): Promise<FileData[]> {
        const outputFiles: FileData[] = [];

        if (inputFormat.internal == "mcmap" && outputFormat.internal == "rgb") {
            for (const file of inputFiles) {
                try {
                    const result = pako.ungzip(file.bytes);
                    const nbt = await NBT.read(result);
                    if (NBT.isTag<NBT.CompoundTag>(nbt.data)) {
                        const data: NBT.CompoundTag = nbt.data;
                        const mapdata = data["data"];
                        if (NBT.isTag<NBT.CompoundTag>(mapdata)) {
                            const width = NBT.isTag<NBT.IntTag>(mapdata["width"]) ? mapdata["width"].valueOf() : DEFAULT_WIDTH;
                            const height = NBT.isTag<NBT.IntTag>(mapdata["height"]) ? mapdata["height"].valueOf() : DEFAULT_HEIGHT;
                            const colors = NBT.isTag<NBT.ByteArrayTag>(mapdata["colors"]) ? new Uint8Array(mapdata["colors"]) : new Uint8Array([]);
                            const bytes = map2rgb(colors, width, height);
                            outputFiles.push({
                                name: file.name,
                                bytes: new Uint8Array(bytes)
                            })
                        }
                    }
                } catch (e) {
                    console.error(e);
                }
            }
        }
        if (inputFormat.internal == "rgb" && outputFormat.internal == "mcmap") {
            throw new Error("Not Implemented")
        }
        return outputFiles;
    }
}

function map2rgb(colors: Uint8Array, width: number, height: number): number[] {
    const out: number[] = []

    for (let i = 0; i < width * height; i++) {
        const color_id = colors[i]
        let color = color_id_to_rgb(color_id)

        if (color === null) {
            console.error(`Unknown color ID: ${color_id}.`)
            color = ERROR_COLOR;
        }

        out.push(...color);
    }

    return out;
}

function color_id_to_rgb(id: number): number[] | null {
    const [base_id, shade_id] = [Math.floor(id / 4), id % 4]
    if (!(base_id in base_colours)) return null;

    let [r, g, b, _] = base_colours[base_id]

    let shade_mul = 0;
    if (shade_id == 0) shade_mul = 180
    else if (shade_id == 1) shade_mul = 220
    else if (shade_id == 2) shade_mul = 255
    else if (shade_id == 3) shade_mul = 135

    return [Math.floor((r * shade_mul) / 255), Math.floor((g * shade_mul) / 255), Math.floor((b * shade_mul) / 255)];
}

export default mcMapHandler;
