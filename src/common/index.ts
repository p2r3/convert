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
