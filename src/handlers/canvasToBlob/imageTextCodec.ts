/** Ordered from darkest to lightest. Every entry is a visible ASCII character. */
export const INTENSITY_PALETTE = "@%#*+=-:.";

export interface GrayscaleImage {
  width: number;
  height: number;
  /** One grayscale value in the range 0–255 for each pixel, row-major. */
  pixels: ArrayLike<number>;
}

export interface DecodedImageText {
  width: number;
  height: number;
  /** RGBA pixels with an opaque alpha channel, row-major. */
  pixels: Uint8ClampedArray<ArrayBuffer>;
}

export class ImageTextDecodeError extends Error {
  constructor(message: string) {
    super(`Invalid image text: ${message}`);
    this.name = "ImageTextDecodeError";
  }
}

function validateDimensions(width: number, height: number): number {
  if (!Number.isSafeInteger(width) || width < 1) {
    throw new TypeError("Image text width must be a positive safe integer.");
  }
  if (!Number.isSafeInteger(height) || height < 1) {
    throw new TypeError("Image text height must be a positive safe integer.");
  }

  const pixelCount = width * height;
  if (!Number.isSafeInteger(pixelCount)) {
    throw new TypeError("Image text dimensions are too large.");
  }
  return pixelCount;
}

function clampIntensity(intensity: number): number {
  if (!Number.isFinite(intensity)) {
    throw new TypeError("Image text intensity must be finite.");
  }
  return Math.min(255, Math.max(0, intensity));
}

export function intensityToCharacter(intensity: number): string {
  const normalized = clampIntensity(intensity) / 255;
  const index = Math.round(normalized * (INTENSITY_PALETTE.length - 1));
  return INTENSITY_PALETTE[index];
}

export function characterToIntensity(character: string): number {
  if (character.length !== 1) {
    throw new ImageTextDecodeError("each pixel must be represented by one character.");
  }

  const index = INTENSITY_PALETTE.indexOf(character);
  if (index < 0) {
    throw new ImageTextDecodeError(`unsupported intensity character ${JSON.stringify(character)}.`);
  }

  return Math.round((index / (INTENSITY_PALETTE.length - 1)) * 255);
}

/**
 * Converts an RGBA pixel to grayscale by compositing transparency over white.
 * The result is the value encoded by the image-text palette.
 */
export function rgbaToGrayscale(red: number, green: number, blue: number, alpha: number): number {
  const opaqueIntensity = red * 0.299 + green * 0.587 + blue * 0.114;
  const opacity = clampIntensity(alpha) / 255;
  return Math.round(opaqueIntensity * opacity + 255 * (1 - opacity));
}

export function encodeImageText(image: GrayscaleImage): string {
  const pixelCount = validateDimensions(image.width, image.height);
  if (image.pixels.length !== pixelCount) {
    throw new TypeError(`Image text pixel data must contain ${pixelCount} values.`);
  }

  const rows: string[] = [];
  for (let y = 0; y < image.height; y++) {
    let row = "";
    for (let x = 0; x < image.width; x++) {
      row += intensityToCharacter(image.pixels[y * image.width + x]);
    }
    rows.push(row);
  }

  return rows.join("\n");
}

/**
 * Returns null unless the entire text is a rectangular grid made only from the
 * image intensity palette. Dimensions are inferred from the rows and columns.
 */
export function decodeImageText(text: string): DecodedImageText | null {
  const normalized = text.replace(/\r\n?/g, "\n");
  const content = normalized.endsWith("\n") ? normalized.slice(0, -1) : normalized;
  if (!content) return null;

  const rows = content.split("\n");
  const width = rows[0].length;
  if (width < 1) return null;
  if (rows.some(row => row.length !== width)) return null;
  if (rows.some(row => [...row].some(character => !INTENSITY_PALETTE.includes(character)))) return null;

  const height = rows.length;
  const pixelCount = validateDimensions(width, height);

  let pixels: Uint8ClampedArray<ArrayBuffer>;
  try {
    pixels = new Uint8ClampedArray(pixelCount * 4);
  } catch (_) {
    throw new ImageTextDecodeError("image dimensions cannot be allocated.");
  }

  for (let y = 0; y < height; y++) {
    const row = rows[y];
    for (let x = 0; x < width; x++) {
      const intensity = characterToIntensity(row[x]);
      const offset = (y * width + x) * 4;
      pixels[offset] = intensity;
      pixels[offset + 1] = intensity;
      pixels[offset + 2] = intensity;
      pixels[offset + 3] = 255;
    }
  }

  return { width, height, pixels };
}
