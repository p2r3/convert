import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import { FormatDefinition } from "../FormatHandler.ts";
import Formats, { AUDIO_FILES, Category } from "src/Formats.ts";
import type { ConvertContext } from "src/ui/ProgressStore.ts";
import { categoriesOf } from "src/ConversionSettings.ts";
import { changeExt, encode } from "src/common/index.ts";
import { loadFFmpeg, readOutput, run, VIDEO_FILES } from "./videoTools.ts";
import { initializeImageMagick, MagickImage, MagickReadSettings } from "@imagemagick/magick-wasm";
import type { MagickFormat } from "@imagemagick/magick-wasm";
import magickWasmUrl from "@imagemagick/magick-wasm/magick.wasm?url";
import { parseBuffer } from "music-metadata";

// its own format, so that picking it is a request for the report rather than a plain JSON
const METADATA = new FormatDefinition(
  "Metadata report",
  "metadata",
  "json",
  "application/json",
  Category.DATA,
);

const image = (name: string, format: string, mime: string) =>
  new FormatDefinition(name, format, format, mime, Category.IMAGE);

/**
 * Pictures read as they are, because converting them first would lose what this reports. The
 * internal name is ImageMagick's, which some of them need to be recognised.
 */
const PICTURES = [
  Formats.JPEG.builder("JPEG"),
  Formats.PNG.builder("PNG"),
  Formats.WEBP.builder("WEBP"),
  Formats.TIFF.builder("TIFF"),
  image("High Efficiency Image Format", "heic", "image/heic").builder("HEIC"),
  image("High Efficiency Image Format", "heif", "image/heif").builder("HEIF"),
  image("AV1 Image File Format", "avif", "image/avif").builder("AVIF"),
  image("Digital Negative Raw Format", "dng", "image/x-adobe-dng").builder("DNG"),
  image("Canon Digital Camera Raw Format", "cr2", "image/x-cr2").builder("CR2"),
  image("Nikon Digital SLR Camera Raw Format", "nef", "image/x-nef").builder("NEF"),
  image("Sony Alpha Raw Format", "arw", "image/x-arw").builder("ARW"),
].map((format) => format.from());

/** Seconds of a song that the tempo is estimated from. */
const TEMPO_SECONDS = 120;
/** Sample rate the tempo is estimated at: beats live far below it. */
const TEMPO_RATE = 11025;

/**
 * Estimates the tempo of music in beats per minute: how often the loudness jumps, from the
 * autocorrelation of its onsets.
 * @param samples Mono audio.
 * @returns Between 60 and 200, or undefined if nothing repeats.
 */
export function estimateBpm(samples: Float32Array, rate: number): number | undefined {
  const hop = Math.max(1, Math.round(rate / 86));
  const envelopeRate = rate / hop;
  const frames = Math.floor(samples.length / hop);
  // the rise in log energy from one frame to the next, ignoring falls
  const onsets = new Float32Array(frames);
  let previous = 0;
  for (let f = 0; f < frames; f++) {
    let energy = 0;
    for (let i = f * hop; i < (f + 1) * hop; i++) energy += samples[i] * samples[i];
    const level = Math.log(energy + 1e-9);
    onsets[f] = f > 0 ? Math.max(0, level - previous) : 0;
    previous = level;
  }
  const mean = onsets.reduce((sum, v) => sum + v, 0) / frames;
  for (let f = 0; f < frames; f++) onsets[f] -= mean;

  const minLag = Math.floor((60 * envelopeRate) / 200);
  const maxLag = Math.ceil((60 * envelopeRate) / 60);
  if (frames < maxLag * 2) return undefined;
  const correlation = new Float32Array(maxLag + 2);
  for (let lag = minLag - 1; lag <= maxLag + 1; lag++) {
    let sum = 0;
    for (let f = 0; f + lag < frames; f++) sum += onsets[f] * onsets[f + lag];
    correlation[lag] = sum / (frames - lag);
  }
  // a beat also repeats at twice its period, so lean towards the tempo people tap along to
  const weight = (lag: number) => {
    const octaves = Math.log2((60 * envelopeRate) / lag / 120);
    return Math.exp(-0.5 * octaves * octaves);
  };
  let best = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (!best || correlation[lag] * weight(lag) > correlation[best] * weight(best)) best = lag;
  }
  if (correlation[best] <= 0) return undefined;
  // the peak between frames, from the parabola through it and its neighbours
  const [a, b, c] = [correlation[best - 1], correlation[best], correlation[best + 1]];
  const shift = a - 2 * b + c === 0 ? 0 : (0.5 * (a - c)) / (a - 2 * b + c);
  const bpm = (60 * envelopeRate) / (best + Math.max(-0.5, Math.min(0.5, shift)));
  return Math.round(bpm * 10) / 10;
}

/** Decodes the start of a song to mono samples at {@link TEMPO_RATE}. */
async function decodeForTempo(file: FileData, ctx?: ConvertContext) {
  const ffmpeg = await loadFFmpeg();
  await ffmpeg.writeFile("input", new Uint8Array(file.bytes));
  const args = ["-i", "input", "-t", `${TEMPO_SECONDS}`, "-ac", "1", "-ar", `${TEMPO_RATE}`];
  const { code } = await run(ffmpeg, [...args, "-f", "f32le", "output.raw"], ctx);
  await ffmpeg.deleteFile("input");
  if (code !== 0) return undefined;
  const bytes = await readOutput(ffmpeg, "output.raw");
  return new Float32Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.length / 4));
}

let magick: Promise<void> | undefined;

/** What ImageMagick finds in a picture: its size, colour, EXIF, IPTC and XMP properties. */
async function describePicture(file: FileData, format: FileFormat) {
  magick ??= (async () => {
    const wasm = await (await fetch(magickWasmUrl)).arrayBuffer();
    await initializeImageMagick(new Uint8Array(wasm));
  })();
  await magick;
  const settings = new MagickReadSettings();
  settings.format = format.internal as MagickFormat;
  const picture = MagickImage.create(file.bytes, settings);
  try {
    // ImageMagick reads these profiles into properties only when one of them is asked for
    for (const prefix of ["exif", "iptc", "xmp"]) picture.getAttribute(`${prefix}:*`);
    const properties: Record<string, string> = {};
    for (const name of picture.attributeNames.toSorted()) {
      const value = picture.getAttribute(name);
      if (value !== null) properties[name] = value;
    }
    return {
      width: picture.width,
      height: picture.height,
      colorSpace: String(picture.colorSpace),
      depth: picture.depth,
      hasAlpha: picture.hasAlpha,
      profiles: [...picture.profileNames],
      properties,
    };
  } finally {
    picture.dispose();
  }
}

/** What music-metadata finds in a sound or a video: its streams and its tags. */
async function describeMedia(file: FileData, format: FileFormat) {
  const { format: stream, common } = await parseBuffer(new Uint8Array(file.bytes), {
    mimeType: format.mime,
    size: file.bytes.length,
  });
  // the cover art is described, not copied into the report
  const { picture, ...tags } = common;
  // a video without sound has its duration on its track only
  const duration =
    stream.duration ?? Math.max(0, ...stream.trackInfo.map((track) => track.duration ?? 0));
  return {
    format: { ...stream, duration: duration || undefined },
    tags: Object.fromEntries(
      Object.entries(tags).filter(([, value]) => value !== undefined && value !== null),
    ),
    pictures: picture?.map(({ format, description, type, data }) => ({
      format,
      description,
      type,
      bytes: data.length,
    })),
  };
}

/** Writes down everything a file says about itself, as JSON. */
class metadataHandler implements FormatHandler {
  public readonly name = "metadata";
  public supportedFormats = [
    ...PICTURES,
    ...AUDIO_FILES,
    ...VIDEO_FILES,
    METADATA.builder("json").lossless().to(),
  ];
  public ready = false;

  async init() {
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    _outputFormat: FileFormat,
    _args?: string[],
    ctx?: ConvertContext,
  ): Promise<FileData[]> {
    const categories = categoriesOf(inputFormat);
    const isPicture = categories.includes(Category.IMAGE);
    const isSong = categories.includes(Category.AUDIO) && !categories.includes(Category.VIDEO);
    const outputFiles: FileData[] = [];
    for (const [i, file] of inputFiles.entries()) {
      ctx?.throwIfAborted();
      ctx?.progress(`Reading ${file.name}...`, i / inputFiles.length);
      const report: Record<string, unknown> = {
        file: file.name,
        bytes: file.bytes.length,
        type: inputFormat.name,
      };
      if (isPicture) Object.assign(report, await describePicture(file, inputFormat));
      else {
        const media = await describeMedia(file, inputFormat);
        Object.assign(report, media);
        const duration = media.format.duration ?? 0;
        if (isSong && duration >= 5) {
          ctx?.progress(`Finding the tempo of ${file.name}...`, (i + 0.5) / inputFiles.length);
          const samples = await decodeForTempo(file, ctx);
          const bpm = samples && estimateBpm(samples, TEMPO_RATE);
          if (bpm) report.bpm = bpm;
        }
      }
      outputFiles.push({
        name: changeExt(file.name, "json", "-metadata"),
        bytes: encode(JSON.stringify(report, null, 2) + "\n"),
      });
    }
    return outputFiles;
  }
}

export default metadataHandler;
