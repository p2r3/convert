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

/** @param quality Lossy quality from 1 to 100. Browser default if omitted. */
export async function canvasToBlob(
  bundle: CanvasBundle,
  mime: string,
  quality?: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const blob = await bundle.canvas.convertToBlob({
    type: mime,
    quality: quality && quality / 100,
  });
  return new Uint8Array(await blob.arrayBuffer());
}

/** @param maxSize Longest side in pixels. Larger images are scaled down to it. */
export async function blobToCanvas(
  bundle: CanvasBundle,
  bytes: Uint8Array,
  mime: string,
  maxSize?: number,
) {
  const blob = new Blob([bytes as BlobPart], { type: mime });

  const image = await createImageBitmap(blob);

  const scale = Math.min(1, (maxSize || Infinity) / Math.max(image.width, image.height));
  bundle.canvas.width = Math.max(1, Math.round(image.width * scale));
  bundle.canvas.height = Math.max(1, Math.round(image.height * scale));
  bundle.ctx.drawImage(image, 0, 0, bundle.canvas.width, bundle.canvas.height);
  image.close();
}

/**
 * Writes `text` once across the whole picture, corner to corner and faded, the way the PDF
 * tools stamp a page (src/handlers/pdfTools.ts).
 */
export function drawWatermark(
  ctx: OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
  text: string,
) {
  const diagonal = Math.hypot(width, height);
  ctx.save();
  // sans-serif averages about half an em per character, and the text spans 70 % of the diagonal
  const size = Math.max(8, Math.min(diagonal / 8, (diagonal * 0.7) / (0.5 * text.length)));
  ctx.font = `bold ${size}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.globalAlpha = 0.3;
  ctx.translate(width / 2, height / 2);
  ctx.rotate(-Math.atan2(height, width));
  // a light edge keeps the grey readable on dark pictures
  ctx.lineWidth = Math.max(1, size / 24);
  ctx.strokeStyle = "white";
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = "#808080";
  ctx.fillText(text, 0, 0);
  ctx.restore();
}
