import {
  initializeImageMagick,
  Magick,
  MagickFormat,
  MagickImageCollection,
  MagickReadSettings,
  MagickGeometry
} from "@imagemagick/magick-wasm";

import mime from "mime";
import normalizeMimeType from "../normalizeMimeType.ts";
import CommonFormats from "src/CommonFormats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

class ImageMagickHandler implements FormatHandler {

  public name: string = "ImageMagick";

  public supportedFormats: FileFormat[] = [];

  public ready: boolean = false;

  async init () {

    const wasmLocation = "/convert/wasm/magick.wasm";
    const wasmBuffer = await fetch(wasmLocation).then(r => r.arrayBuffer());
    const wasmBytes = new Uint8Array(wasmBuffer);

    await initializeImageMagick(wasmBytes);

    Magick.supportedFormats.forEach(format => {
      const formatName = format.format.toLowerCase();
      if (formatName === "apng") return;
      if (formatName === "svg") return;
      if (formatName === "ttf") return;
      if (formatName === "otf") return;
      let mimeType = format.mimeType || mime.getType(formatName);
      if (
        !mimeType
        || mimeType.startsWith("text/")
        || mimeType.startsWith("video/")
        || mimeType === "application/json"
      ) return;

      mimeType = normalizeMimeType(mimeType);

      // ImageMagick _really_ likes mislabeling formats
      let description = format.description;
      if (mimeType === "image/jpeg") description = CommonFormats.JPEG.name;
      if (mimeType === "image/gif") description = CommonFormats.GIF.name;
      if (mimeType === "image/webp") description = CommonFormats.WEBP.name;
      if (formatName === "ico") description = "Microsoft Windows ICO";
      if (formatName === "mpo") description = "Multi-Picture Object";
      if (formatName === "vst") description = "Microsoft Visio Template";

      this.supportedFormats.push({
        name: description,
        format: formatName === "jpg" ? "jpeg" : formatName,
        extension: formatName,
        mime: mimeType,
        from: mimeType === "application/pdf" ? false : format.supportsReading,
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
           if (inputFormat.format === "rgb") {
             // Guess how big the Image should be
             inputSettings.width = Math.sqrt(inputFile.bytes.length / 3);
             inputSettings.height = inputSettings.width;
           }
          MagickImageCollection.use(fileCollection => {
            fileCollection.read(inputFile.bytes, inputSettings);
            while (fileCollection.length > 0) {
              const image = fileCollection.shift();
              if (!image) break;

              if(outputFormat.format === "ico" && (image.width > 256 || image.height > 256)) {
                const geometry = new MagickGeometry(256, 256);
                image.resize(geometry);
              }

              outputCollection.push(image);
            }
          });
        }
        outputCollection.write(outputMagickFormat, (bytes) => {
          resolve(new Uint8Array(bytes));
        });
      });
    });

    const baseName = inputFiles[0].name.split(".").slice(0, -1).join(".");
    const name = baseName + "." + outputFormat.extension;
    return [{ bytes, name }];

  }

}

export default ImageMagickHandler;
