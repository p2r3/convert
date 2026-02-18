import {
  initializeImageMagick,
  Magick,
  MagickFormat,
  MagickImageCollection,
  MagickReadSettings
} from "@imagemagick/magick-wasm";

import mime from "mime";
import normalizeMimeType from "../normalizeMimeType.ts";

import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

class ImageMagickHandler implements FormatHandler {

  public name: string = "ImageMagick";

  public supportedFormats: FileFormat[] = [];

  public ready: boolean = false;

  async init () {

    const wasmLocation = "/convert/wasm/magick.wasm";
    const wasmBytes = await fetch(wasmLocation).then(r => r.bytes());

    await initializeImageMagick(wasmBytes);

    Magick.supportedFormats.forEach(format => {
      const formatName = format.format.toLowerCase();
      if (formatName === "apng") return;
      const mimeType = format.mimeType || mime.getType(formatName);
      if (
        !mimeType
        || mimeType.startsWith("text/")
        || mimeType.startsWith("video/")
        || mimeType === "application/json"
      ) return;
      this.supportedFormats.push({
        name: format.description,
        format: formatName,
        extension: formatName,
        mime: normalizeMimeType(mimeType),
        from: format.supportsReading,
        to: format.supportsWriting,
        internal: format.format,
        category: mimeType.split("/")[0],
        lossless: ["png", "bmp", "tiff"].includes(formatName)
      });
    });

    // ====== Manual fine-tuning ======

    const prioritize = ["png", "jpeg", "gif", "pdf"];
    prioritize.reverse();

    this.supportedFormats.sort((a, b) => {
      const priorityIndexA = prioritize.indexOf(a.format);
      const priorityIndexB = prioritize.indexOf(b.format);
      return priorityIndexB - priorityIndexA;
    });

    this.ready = true;
  }

  async doConvert (
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {

    const inputMagickFormat = inputFormat.internal as MagickFormat;
    const outputMagickFormat = outputFormat.internal as MagickFormat;

    const inputSettings = new MagickReadSettings();
    inputSettings.format = inputMagickFormat;


    const bytes: Uint8Array = await new Promise(resolve => {
      MagickImageCollection.use(outputCollection => {
        for (const inputFile of inputFiles) {
           if (inputFormat.format == "rgb") {
             // Guess how big the Image should be
             inputSettings.width = Math.sqrt(inputFile.bytes.length / 3);
             inputSettings.height = inputSettings.width;
           }
          MagickImageCollection.use(fileCollection => {
            fileCollection.read(inputFile.bytes, inputSettings);
            while (fileCollection.length > 0) {
              const image = fileCollection.shift();
              if (!image) break;
              outputCollection.push(image);
            }
          });
        }
        outputCollection.write(outputMagickFormat, (bytes) => {
          resolve(new Uint8Array(bytes));
        });
      });
    });

    const baseName = inputFiles[0].name.split(".")[0];
    const name = baseName + "." + outputFormat.extension;
    return [{ bytes, name }];

  }

}

export default ImageMagickHandler;
