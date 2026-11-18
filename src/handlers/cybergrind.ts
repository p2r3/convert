import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

import Formats from "src/Formats.ts";
import { InitializationError } from "src/errors.ts";
import { changeExt, encode } from "src/common/index.ts";
import { createCanvas, type CanvasBundle } from "src/common/canvas.ts";

class cybergrindHandler implements FormatHandler {
  public readonly name = "cybergrind";
  public supportedFormats = [Formats.PNG.builder("png").from(), Formats.CGP.builder("cgp").to()];
  public ready = false;

  #bundle?: CanvasBundle;

  async init() {
    this.#bundle = createCanvas(16, 16);

    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];

    if (inputFormat.internal !== "png" || outputFormat.internal !== "cgp") {
      throw new TypeError(`Unsupported output format: ${outputFormat.internal}`);
    }
    if (!this.#bundle) {
      throw new InitializationError("Handler not initialized.");
    }
    const { canvas, ctx } = this.#bundle;

    for (const file of inputFiles) {
      // take img and load
      const blob = new Blob([file.bytes], { type: inputFormat.mime });
      const image = await createImageBitmap(blob);

      // make canvas with 16x16
      canvas.width = 16;
      canvas.height = 16;
      ctx.drawImage(image, 0, 0, 16, 16);
      const pixels = ctx.getImageData(0, 0, 16, 16);

      // mcmap's canvas logic used as a base!

      // make the heights array and brightest of each pixel array
      let heights = [];

      let reds: { index: number; value: number }[] = [];
      let greens: { index: number; value: number }[] = [];
      let blues: { index: number; value: number }[] = [];
      for (let i = 0; i < pixels.data.length; i += 4) {
        const r = pixels.data[i];
        const g = pixels.data[i + 1];
        const b = pixels.data[i + 2];

        const grayscale = 0.299 * r + 0.587 * g + 0.114 * b;
        const height = Math.round((grayscale / 255) * 10); // map to 0-10 and round
        heights.push(height);
        reds.push({ index: i / 4, value: r });
        greens.push({ index: i / 4, value: g });
        blues.push({ index: i / 4, value: b });
      }
      // take the 5 brightest pixels of each color, and have no duplicates
      reds.sort((a, b) => b.value - a.value);
      reds = reds.slice(0, 5);

      const usedIndices = new Set(reds.map((p) => p.index));

      greens.sort((a, b) => b.value - a.value);
      greens = greens.filter((p) => !usedIndices.has(p.index)).slice(0, 5);
      greens.forEach((p) => usedIndices.add(p.index));

      blues.sort((a, b) => b.value - a.value);
      blues = blues.filter((p) => !usedIndices.has(p.index)).slice(0, 5);

      let cyberHeights: string = ``;
      let enemyThing: string = ``;
      for (let index = 0; index < heights.length; index++) {
        if (index > 0 && index % 16 == 0) {
          cyberHeights += "\n";
          enemyThing += "\n";
        }

        const height = heights[index];
        cyberHeights += height >= 10 ? `(${height})` : `${height}`;
        // H is Hideous mass, n is melee, p is ranged
        // H is last so it will be less likely to exist
        enemyThing += blues.some((x) => x.index === index)
          ? "H"
          : greens.some((x) => x.index === index)
            ? "n"
            : reds.some((x) => x.index === index)
              ? "p"
              : "0";
      }

      const outputBytes = encode(cyberHeights + "\n\n" + enemyThing);
      const newName = changeExt(file.name, "cgp");

      outputFiles.push({ bytes: outputBytes, name: newName });
    }

    return outputFiles;
  }
}

export default cybergrindHandler;
