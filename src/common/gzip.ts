import { Gunzip, gunzipSync, gzipSync } from "fflate";

export function isGzip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x1f && bytes[1] === 0x8b;
}

type GzipStream = ReadableWritablePair<Uint8Array<ArrayBuffer>, BufferSource>;

function canStream(stream: unknown): boolean {
  return typeof stream !== "undefined" && "stream" in Blob.prototype;
}

async function pipeBytes(
  bytes: Uint8Array,
  transform: GzipStream,
): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function compressGzip(bytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  if (canStream(globalThis.CompressionStream)) {
    return pipeBytes(bytes, new CompressionStream("gzip"));
  }
  return gzipSync(bytes);
}

export async function decompressGzip(bytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  if (canStream(globalThis.DecompressionStream)) {
    return pipeBytes(bytes, new DecompressionStream("gzip"));
  }
  return gunzipSync(bytes);
}

function decompressGzipStream(): GzipStream {
  if (typeof DecompressionStream !== "undefined") return new DecompressionStream("gzip");
  let gunzip: Gunzip;
  return new TransformStream<BufferSource, Uint8Array<ArrayBuffer>>({
    start(controller) {
      gunzip = new Gunzip((chunk) => controller.enqueue(chunk));
    },
    transform: (chunk) => gunzip.push(chunk as Uint8Array),
    flush: () => gunzip.push(new Uint8Array(), true),
  });
}

// the server might send it with Content-Encoding: gzip, so only decompress if it's still gzip
export async function fetchGzip(url: string, type = ""): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}.`);
  if (!response.body?.getReader) {
    let bytes = new Uint8Array(await response.arrayBuffer());
    if (isGzip(bytes)) bytes = await decompressGzip(bytes);
    return new Response(bytes, { headers: { "Content-Type": type } });
  }
  const reader = response.body.getReader();
  let head = new Uint8Array();
  while (head.length < 2) {
    const { done, value } = await reader.read();
    if (done) break;
    const combined = new Uint8Array(head.length + value.length);
    combined.set(head);
    combined.set(value, head.length);
    head = combined;
  }
  let body = new ReadableStream<Uint8Array<ArrayBuffer>>({
    start: (controller) => controller.enqueue(head),
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    cancel: (reason) => reader.cancel(reason),
  });
  if (isGzip(head)) body = body.pipeThrough(decompressGzipStream());
  return new Response(body, { headers: { "Content-Type": type } });
}
