function hasOwnBuffer(bytes: Uint8Array): bytes is Uint8Array<ArrayBuffer> {
  return bytes.buffer instanceof ArrayBuffer;
}

export function ownedBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return hasOwnBuffer(bytes) ? bytes : new Uint8Array(bytes);
}

export const isStringRecord = (value: unknown): value is Record<string, string> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every((entry) => typeof entry === "string");

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
