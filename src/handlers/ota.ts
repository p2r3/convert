import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

import Formats from "src/Formats.ts";
import { InitializationError } from "src/errors.ts";
import { changeExt } from "src/common/index.ts";
import { canvasToBlob, createCanvas, type CanvasBundle } from "src/common/canvas.ts";

class otaHandler implements FormatHandler {
  public readonly name = "ota";
  public supportedFormats = [
    Formats.PNG.builder("png").lossless().fromTo(),
    Formats.OTA.builder("ota").fromTo(),
  ];
  public ready = false;

  #bundle?: CanvasBundle;

  async init() {
    this.#bundle = createCanvas();

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

    if (inputFormat.internal === "ota" && outputFormat.mime === Formats.PNG.mime) {
      for (const file of inputFiles) {
        let new_file_bytes = new Uint8Array(file.bytes);

        // Read header to get image size
        canvas.width = new_file_bytes[1];
        canvas.height = new_file_bytes[2];

        // Read each byte and write 8 pixels to screen per
        const rgba: number[] = [];
        for (let i = 0; i < new_file_bytes.length - 4; i++) {
          for (let bit = 7; bit > -1; bit--) {
            // Convert to binary and look at the bits.
            if (new_file_bytes[i + 4] & (1 << bit)) {
              rgba.push(0, 0, 0, 255);
            } else {
              rgba.push(255, 255, 255, 255);
            }

            if (rgba.length >= canvas.width * canvas.height * 4) {
              break;
            }
          }

          if (rgba.length >= canvas.width * canvas.height * 4) {
            break;
          }
        }

        // Writes our results to the canvas
        const image_data = new ImageData(new Uint8ClampedArray(rgba), canvas.width, canvas.height);

        ctx.putImageData(image_data, 0, 0);

        new_file_bytes = await canvasToBlob(this.#bundle, outputFormat.mime);

        outputFiles.push({
          name: changeExt(file.name, outputFormat.extension),
          bytes: new_file_bytes,
        });
      }
    } else if (inputFormat.mime === Formats.PNG.mime && outputFormat.internal === "ota") {
      for (const file of inputFiles) {
        let writer_array: number[] = [];

        // Some code copied from mcmap.ts
        const blob = new Blob([file.bytes], { type: inputFormat.mime });

        const image = await createImageBitmap(blob);

        if (image.width > 255) {
          canvas.width = 255;
        } else {
          canvas.width = image.width;
        }
        if (image.height > 255) {
          canvas.height = 255;
        } else {
          canvas.height = image.height;
        }
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        console.log(pixels.data);

        // Start writing our .otb file, first with the header
        writer_array.push(0, canvas.width, canvas.height, 1);
        let bits = [];

        // Then iterate through image data
        for (let i = 0; i < pixels.data.length; i = i + 4) {
          // Determine the "perceived" lightness of a pixel by the human eye.
          let luminance =
            pixels.data[i] * 0.2126 + pixels.data[i + 1] * 0.7152 + pixels.data[i + 2] * 0.0722;

          if (luminance > 0.5 * 255) {
            bits.push("0");
          } else {
            bits.push("1");
          }
        }
        console.log(bits);

        // Pad bits
        while (bits.length % 8 !== 0) {
          bits.push("0");
        }

        // Finally, use the bits to write to our file's bytes
        for (let i = 0; i < bits.length; i = i + 8) {
          let result: string = bits[i + 0].concat(
            bits[i + 1],
            bits[i + 2],
            bits[i + 3],
            bits[i + 4],
            bits[i + 5],
            bits[i + 6],
            bits[i + 7],
          );

          writer_array.push(parseInt(result, 2));
        }

        outputFiles.push({
          name: changeExt(file.name, outputFormat.extension),
          bytes: new Uint8Array(writer_array),
        });
      }
    } else {
      throw new TypeError(
        `Unsupported conversion path: ${inputFormat.internal} -> ${outputFormat.internal}`,
      );
    }

    return outputFiles;
  }
}

export default otaHandler;
