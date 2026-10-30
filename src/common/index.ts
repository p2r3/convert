export function stripExt(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx > 0 ? name.slice(0, idx) : name;
}

export function getExt(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx > 0 ? name.slice(idx + 1) : "";
}

export function changeExt(name: string, newExt: string, suffix: string = ""): string {
  return `${stripExt(name)}${suffix}.${newExt}`;
}

export function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

export function encode(text: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(text);
}

// the server might send it with Content-Encoding: gzip, so only decompress if it's still gzip
export async function fetchGzip(url: string, type = ""): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}.`);
  const reader = response.body!.getReader();
  const { value: head = new Uint8Array() } = await reader.read();
  let body = new ReadableStream<Uint8Array<ArrayBuffer>>({
    start: (controller) => controller.enqueue(head),
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    cancel: (reason) => reader.cancel(reason),
  });
  if (head[0] === 0x1f && head[1] === 0x8b) {
    body = body.pipeThrough(new DecompressionStream("gzip"));
  }
  return new Response(body, { headers: { "Content-Type": type } });
}
