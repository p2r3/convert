// file: bunburrows.ts

import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats from "src/CommonFormats.ts";

const COLOR_WALKABLE = [0,0,0];
const COLOR_BREAKABLE = [98,135,64];
const COLOR_UNBREAKABLE = [46,76,24];
const COLOR_BUNNY = [255,255,255];

class bunburrowsHandler implements FormatHandler {

    public name: string = "bunburrows";
    public supportedFormats?: FileFormat[];
    public ready: boolean = false;

    #canvas?: HTMLCanvasElement;
    #ctx?: CanvasRenderingContext2D;

    async init () {
        this.supportedFormats = [
            CommonFormats.PNG.supported("png", true, true, false),
            {
                name: "Pâquerette: Down the Bunburrows Level File",
                format: "bunlevel",
                extension: "level",
                mime: "application/x-bunburrows-level",
                from: true,
                to: false,
                internal: "bunlevel",
            },
        ];

        this.#canvas = document.createElement("canvas");
        this.#ctx = this.#canvas.getContext("2d") || undefined;

        this.ready = true;
    }

    async doConvert (
        inputFiles: FileData[],
        inputFormat: FileFormat,
        outputFormat: FileFormat
    ): Promise<FileData[]> {
        const outputFiles: FileData[] = [];

        if (!this.#canvas || !this.#ctx) {
            throw "Handler not initialized.";
        }
        
        for (const file of inputFiles) {
            let new_file_bytes = new Uint8Array(file.bytes);

            // Code here based on mcmap.ts
            if (inputFormat.internal == "bunlevel" && outputFormat.mime == CommonFormats.PNG.mime) {
                // Read .level as text
                let level_string = new TextDecoder().decode(new_file_bytes);
                let level_data_array = level_string.split(/[\s,;:]+/);
                console.log(String(level_data_array));

                // Establish dimensions
                const scale = 5;

                const tiles_wide = 15;
                const tiles_high = 9;

                this.#canvas.width = tiles_wide*scale;
                this.#canvas.height = tiles_high*scale;

                // Safety check
                if (level_data_array.length < tiles_wide*tiles_high) {
                    throw new Error("Invalid level file.");
                }

                // Determine color per-pixel
                const rgba: number[] = []
                for (let i = 0; i < this.#canvas.width * this.#canvas.height; i++) {
                    // What pixel are we on?
                    const i_x = i % this.#canvas.width;
                    const i_y = Math.floor(i / this.#canvas.width);

                    // What tile are we on?
                    const current_tile_x = Math.floor(i_x / scale);
                    const current_tile_y = Math.floor(i_y / scale);

                    // What pixel are we on, relative to the tile?
                    const tile_pixel_x = i_x % scale;
                    const tile_pixel_y = i_y % scale;

                    // The string describing the current tile's data.
                    const current_tile_data : string = level_data_array[current_tile_y*tiles_wide + current_tile_x];

                    // Start drawing pixels!
                    console.log(current_tile_x + " , " + tile_pixel_y + " (" + i_x + " , " + i_y + ")");
                    let color = COLOR_BUNNY;
                    
                    // Walkable tiles
                    if (current_tile_data.startsWith("T")) {
                        color = COLOR_WALKABLE;

                        // Burning tile
                        if (current_tile_data.includes("B",2)) {
                            if (tile_pixel_x + tile_pixel_y % 2 == 0) {
                                color = COLOR_UNBREAKABLE;
                            }
                        }
                        else {
                            // Undiggable tile
                            if (current_tile_data.includes("K",2)) {
                                if ((tile_pixel_x == 1 && tile_pixel_y == 0) || (tile_pixel_x == 0 && tile_pixel_y == 1) || (tile_pixel_x == 4 && tile_pixel_y == 2) || (tile_pixel_x == 3 && tile_pixel_y == 3) || (tile_pixel_x == 2 && tile_pixel_y == 4)) {
                                    color = COLOR_UNBREAKABLE;
                                }
                            }
                            
                            // Trap tile
                            if (current_tile_data.includes("T",2)) {
                                if ((tile_pixel_x == 1 && tile_pixel_y == 0) || (tile_pixel_x == 0 && tile_pixel_y == 1) || (tile_pixel_x == 4 && tile_pixel_y == 2) || (tile_pixel_x == 3 && tile_pixel_y == 3) || (tile_pixel_x == 2 && tile_pixel_y == 4)) {
                                    color = COLOR_UNBREAKABLE;
                                }
                            }
                            // Carrot tile
                            else if (current_tile_data.includes("C",2)) {
                                if (tile_pixel_x == 3 && tile_pixel_y == 1) {
                                    color = COLOR_UNBREAKABLE;
                                }
                                if ((tile_pixel_x == 2 && tile_pixel_y == 2) || (tile_pixel_x == 1 && tile_pixel_y == 3)) {
                                    color = COLOR_BUNNY;
                                }
                            }
                        }
                    }
                    // Breakable walls
                    else if (current_tile_data.startsWith("W")) {
                        color = COLOR_BREAKABLE;

                        // Tunnels
                        if (current_tile_data.includes("U",2) && (tile_pixel_x == 2 && (tile_pixel_y == 0 || tile_pixel_y == 1 || tile_pixel_y == 2))) {
                            color = COLOR_WALKABLE;
                        }
                        if (current_tile_data.includes("D",2) && (tile_pixel_x == 2 && (tile_pixel_y == 2 || tile_pixel_y == 3 || tile_pixel_y == 4))) {
                            color = COLOR_WALKABLE;
                        }
                        if (current_tile_data.includes("L",2) && (tile_pixel_y == 2 && (tile_pixel_x == 0 || tile_pixel_x == 1 || tile_pixel_x == 2))) {
                            color = COLOR_WALKABLE;
                        }
                        if (current_tile_data.includes("R",2) && (tile_pixel_y == 2 && (tile_pixel_x == 2 || tile_pixel_x == 3 || tile_pixel_x == 4))) {
                            color = COLOR_WALKABLE;
                        }
                    }
                    // Bunnies!
                    else if (current_tile_data.startsWith("B")) {
                        color = COLOR_WALKABLE;
    
                        // Undiggable tile
                        if (current_tile_data.includes("K",2)) {
                            if ((tile_pixel_x == 1 && tile_pixel_y == 0) || (tile_pixel_x == 0 && tile_pixel_y == 1) || (tile_pixel_x == 4 && tile_pixel_y == 2) || (tile_pixel_x == 3 && tile_pixel_y == 3) || (tile_pixel_x == 2 && tile_pixel_y == 4)) {
                                color = COLOR_UNBREAKABLE;
                            }
                        }
                        if (current_tile_data.includes("B",2)) {
                            if (tile_pixel_x + tile_pixel_y % 2 == 0) {
                                color = COLOR_UNBREAKABLE;
                            }
                        }
                    
                        // Draw the bunny.
                        if (tile_pixel_x != 0 && tile_pixel_x != 4 && tile_pixel_y != 0 && tile_pixel_y != 4 && !(tile_pixel_x == 2 && tile_pixel_y == 1)) {
                            color = COLOR_BUNNY;
                        }
                    }
                    // Unbreakable walls
                    else if (current_tile_data.startsWith("R")) {
                        color = COLOR_UNBREAKABLE;

                        // Tunnels
                        if (current_tile_data.includes("U",2) && (tile_pixel_x == 2 && (tile_pixel_y == 0 || tile_pixel_y == 1 || tile_pixel_y == 2))) {
                            color = COLOR_WALKABLE;
                        }
                        if (current_tile_data.includes("D",2) && (tile_pixel_x == 2 && (tile_pixel_y == 2 || tile_pixel_y == 3 || tile_pixel_y == 4))) {
                            color = COLOR_WALKABLE;
                        }
                        if (current_tile_data.includes("L",2) && (tile_pixel_y == 2 && (tile_pixel_x == 0 || tile_pixel_x == 1 || tile_pixel_x == 2))) {
                            color = COLOR_WALKABLE;
                        }
                        if (current_tile_data.includes("R",1) && (tile_pixel_y == 2 && (tile_pixel_x == 2 || tile_pixel_x == 3 || tile_pixel_x == 4))) {
                            color = COLOR_WALKABLE;
                        }
                    }
                    // Exit hole
                    else if (current_tile_data.startsWith("E")) {
                        color = COLOR_WALKABLE;
                        
                        if (((tile_pixel_y == 1 || tile_pixel_y == 3) && (tile_pixel_x == 1 || tile_pixel_x == 2 || tile_pixel_x == 3)) || (tile_pixel_y == 2 && (tile_pixel_x == 0 || tile_pixel_x == 4))) {
                            color = COLOR_BUNNY;
                        }
                    }
                    // Entrance hole
                    else if (current_tile_data.startsWith("S")) {
                        color = COLOR_WALKABLE;
                        
                        // Burning tile
                        if (current_tile_data.includes("B",2)) {
                            if (tile_pixel_x + tile_pixel_y % 2 == 0) {
                                color = COLOR_UNBREAKABLE;
                            }
                        }
                        // Undiggable tile
                        else if (current_tile_data.includes("K",2)) {
                            if ((tile_pixel_x == 1 && tile_pixel_y == 0) || (tile_pixel_x == 0 && tile_pixel_y == 1) || (tile_pixel_x == 4 && tile_pixel_y == 2) || (tile_pixel_x == 3 && tile_pixel_y == 3) || (tile_pixel_x == 2 && tile_pixel_y == 4)) {
                                color = COLOR_UNBREAKABLE;
                            }
                        }

                        // Draw the entrance
                        if (((tile_pixel_y == 1 || tile_pixel_y == 3) && (tile_pixel_x == 1 || tile_pixel_x == 3)) || (tile_pixel_y == 2 && (tile_pixel_x == 0 || tile_pixel_x == 2 || tile_pixel_x == 4))) {
                            color = COLOR_BUNNY;
                        }
                    }
                    // Elevator
                    else if (current_tile_data.startsWith("!")) {
                        color = COLOR_BUNNY;
                        
                        if (tile_pixel_y == 0 && (tile_pixel_x == 0 || tile_pixel_x == 4)) {
                            color = COLOR_WALKABLE;
                        }
                        if ((tile_pixel_x == 1 || tile_pixel_x == 3) || (tile_pixel_y == 2 || tile_pixel_y == 3 || tile_pixel_y == 4)) {
                            color = COLOR_UNBREAKABLE;
                        }
                    }

                    rgba.push(...color, 255);
                }

                // Writes our results to the canvas
                const image_data = new ImageData(new Uint8ClampedArray(rgba), this.#canvas.width, this.#canvas.height);

                this.#ctx.putImageData(image_data, 0, 0);

                new_file_bytes = await new Promise((resolve, reject) => {
                    this.#canvas!.toBlob((blob) => {
                        if (!blob) return reject("Canvas output failed");
                        blob.arrayBuffer().then(buf => resolve(new Uint8Array(buf)));
                    }, outputFormat.mime);
                });
            }
            else {
                throw new Error("Invalid input-output.");
            }

            outputFiles.push({
                name: file.name.split(".").slice(0, -1).join(".") + "." + outputFormat.extension,
                bytes: new_file_bytes
            })
        }
        return outputFiles;
    }
}

export default bunburrowsHandler;