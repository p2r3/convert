/**
 * HEIC/HEIF Image Handler
 * Handles High Efficiency Image Container (HEIC) and High Efficiency Image
 * File Format (HEIF) — the modern image format used by Apple devices.
 *
 * Decoding (HEIC/HEIF → PNG/JPEG/WebP):
 *   Uses heic2any, a MIT-licensed WebAssembly-powered library.
 *   Supports single images and multi-frame sequences.
 *
 * Encoding (PNG/JPEG/WebP → HEIC/HEIF):
 *   Uses the browser's native HTMLCanvasElement.toBlob API.
 *   Native HEIC encoding works in Safari on macOS/iOS. Other browsers will
 *   throw a readable error message explaining the limitation.
 */

// @ts-ignore — heic2any ships no TypeScript declarations
import heic2any from "heic2any";

import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats from "src/CommonFormats.ts";

class HEICHandler implements FormatHandler {

  public name: string = "heic2any";
  public ready: boolean = false;

  public supportedFormats: FileFormat[] = [
    CommonFormats.HEIC.builder("heic").allowFrom().allowTo(),
    CommonFormats.HEIF.builder("heif").allowFrom().allowTo(),
    CommonFormats.PNG.builder("png").allowFrom().allowTo().markLossless(),
    CommonFormats.JPEG.builder("jpeg").allowFrom().allowTo(),
    CommonFormats.WEBP.builder("webp").allowFrom().allowTo(),
  ];

  async init(): Promise<void> {
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {

    const isHeicInput  = inputFormat.internal  === "heic" || inputFormat.internal  === "heif";
    const isHeicOutput = outputFormat.internal === "heic" || outputFormat.internal === "heif";

    if (isHeicInput && !isHeicOutput) {
      return this.#decodeHeic(inputFiles, inputFormat, outputFormat);
    }

    if (!isHeicInput && isHeicOutput) {
      return this.#encodeHeic(inputFiles, inputFormat, outputFormat);
    }

    // HEIC ↔ HEIC passthrough (same format, no-op)
    return inputFiles.map(f => ({
      name: f.name,
      bytes: new Uint8Array(f.bytes),
    }));
  }

  /**
   * Decode HEIC/HEIF → PNG / JPEG / WebP using heic2any.
   */
  async #decodeHeic(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {

    const outputFiles: FileData[] = [];
    const toType = outputFormat.mime;

    for (const inputFile of inputFiles) {
      const inputBlob = new Blob([inputFile.bytes as BlobPart], { type: inputFormat.mime });

      let result: Blob | Blob[];
      try {
        result = await heic2any({ blob: inputBlob, toType, quality: 0.92 });
      } catch (err: any) {
        // heic2any throws when the file is not a valid HEIC/HEIF
        throw new Error(
          `Could not decode HEIC/HEIF file "${inputFile.name}": ${err?.message ?? err}`
        );
      }

      const blobs: Blob[] = Array.isArray(result) ? result : [result];
      const baseName = inputFile.name.replace(/\.(heic|heif)$/i, "");

      if (blobs.length === 1) {
        const bytes = new Uint8Array(await blobs[0].arrayBuffer());
        outputFiles.push({
          name: `${baseName}.${outputFormat.extension}`,
          bytes,
        });
      } else {
        // Multi-frame HEIC (e.g. burst photos) → one output file per frame
        for (let i = 0; i < blobs.length; i++) {
          const bytes = new Uint8Array(await blobs[i].arrayBuffer());
          outputFiles.push({
            name: `${baseName}_${String(i + 1).padStart(3, "0")}.${outputFormat.extension}`,
            bytes,
          });
        }
      }
    }

    return outputFiles;
  }

  /**
   * Encode PNG / JPEG / WebP → HEIC / HEIF using the browser canvas API.
   *
   * Native encoding is only supported in Safari on macOS/iOS (≥ High Sierra /
   * iOS 11). Other browsers will reject the toBlob call and throw a clear
   * error message rather than silently producing a corrupt file.
   */
  async #encodeHeic(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {

    const outputFiles: FileData[] = [];

    for (const inputFile of inputFiles) {
      const inputBlob = new Blob([inputFile.bytes as BlobPart], { type: inputFormat.mime });

      // Decode the source image via ImageBitmap for universal browser support
      let bitmap: ImageBitmap;
      try {
        bitmap = await createImageBitmap(inputBlob);
      } catch (err: any) {
        throw new Error(
          `Could not decode source image "${inputFile.name}": ${err?.message ?? err}`
        );
      }

      const canvas = document.createElement("canvas");
      canvas.width  = bitmap.width;
      canvas.height = bitmap.height;

      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Failed to obtain 2D canvas context.");
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();

      const outputBlob = await new Promise<Blob | null>(resolve =>
        canvas.toBlob(resolve, outputFormat.mime, 0.92)
      );

      if (!outputBlob) {
        throw new Error(
          `HEIC/HEIF encoding is not supported in this browser. ` +
          `Native encoding requires Safari on macOS (High Sierra or later) or iOS (11 or later). ` +
          `Consider converting to PNG or JPEG instead.`
        );
      }

      const baseName = inputFile.name.replace(/\.[^.]+$/, "");
      outputFiles.push({
        name: `${baseName}.${outputFormat.extension}`,
        bytes: new Uint8Array(await outputBlob.arrayBuffer()),
      });
    }

    return outputFiles;
  }
}

export default HEICHandler;
