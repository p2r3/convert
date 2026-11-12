import type { ConvertOptions } from "src/Settings.ts";

export type CanvasBundle = { canvas: OffscreenCanvas; ctx: OffscreenCanvasRenderingContext2D };

export function createCanvas(
  width: number = 0,
  height: number = 0,
  cpu: boolean = true,
): CanvasBundle {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d", { willReadFrequently: cpu });
  if (!ctx) throw new Error("Could not create canvas context.");
  return { canvas, ctx };
}

export async function canvasToBlob(
  bundle: CanvasBundle,
  mime: string,
  /** Encoder quality from 0 to 1, for lossy formats. */
  quality?: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const blob = await bundle.canvas.convertToBlob({
    type: mime,
    quality,
  });
  return new Uint8Array(await blob.arrayBuffer());
}

export async function blobToCanvas(bundle: CanvasBundle, bytes: Uint8Array, mime: string) {
  const blob = new Blob([bytes as BlobPart], { type: mime });

  const image = await createImageBitmap(blob);

  bundle.canvas.width = image.width;
  bundle.canvas.height = image.height;
  bundle.ctx.drawImage(image, 0, 0);
  image.close();
}

const scaled = (side: number, from: number, to: number) =>
  from ? Math.max(1, Math.round((side * to) / from)) : side;

/** The size to output a `width`×`height` image at. With one side set, the aspect ratio is kept. */
export function resolveSize(width: number, height: number, options: ConvertOptions = {}) {
  return {
    width: options.width ?? (options.height ? scaled(width, height, options.height) : width),
    height: options.height ?? (options.width ? scaled(height, width, options.width) : height),
  };
}
