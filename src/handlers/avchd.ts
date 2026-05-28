import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import JSZip from "jszip";

/**
 * AVCHD ZIP handler.
 *
 * macOS silently zips an AVCHD folder when you drag it into a browser —
 * the user ends up uploading a .zip instead of the individual .mts files
 * inside BDMV/STREAM/.  This handler unpacks such a ZIP and returns every
 * .mts / .m2ts file it finds, so the graph can route them through FFmpeg.
 *
 * Conversion path:  ZIP (avchd) → MTS  (then FFmpeg takes it to MP4/etc.)
 */
class avchdHandler implements FormatHandler {

  public name: string = "AVCHD Extractor";
  public supportedFormats: FileFormat[] = [];
  public ready: boolean = false;

  async init () {
    this.supportedFormats = [
      // Input: a ZIP that wraps an AVCHD package
      {
        name: "AVCHD Package (ZIP)",
        format: "avchd-zip",
        extension: "zip",
        mime: "application/zip",
        from: true,
        to: false,
        internal: "avchd-zip",
        category: "video"
      },
      // Output: raw MTS files extracted from the ZIP
      {
        name: "AVCHD Video",
        format: "mts",
        extension: "mts",
        mime: "video/mp2t",
        from: false,
        to: true,
        internal: "mts",
        category: "video"
      }
    ];
    this.ready = true;
  }

  async doConvert (
    inputFiles: FileData[],
    _inputFormat: FileFormat,
    _outputFormat: FileFormat
  ): Promise<FileData[]> {

    const results: FileData[] = [];

    for (const file of inputFiles) {
      const zip = await JSZip.loadAsync(file.bytes);
      const mtsEntries = Object.values(zip.files).filter(entry =>
        !entry.dir &&
        /\.(mts|m2ts)$/i.test(entry.name)
      );

      if (mtsEntries.length === 0) {
        throw `No .mts or .m2ts files found inside ${file.name}`;
      }

      for (const entry of mtsEntries) {
        const bytes = await entry.async("uint8array");
        // Use just the filename, not the full path inside the ZIP
        const name = entry.name.split("/").pop()!;
        results.push({ name, bytes });
      }
    }

    return results;
  }

}

export default avchdHandler;
