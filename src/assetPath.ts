const ABSOLUTE_URL_PATTERN = /^https?:\/\//i;

/**
 * Resolve a public asset path using Vite's configured base URL.
 */
export function withBasePath(path: string): string {
  const cleanPath = path.replace(/^\/+/, "");
  const baseUrl = import.meta.env.BASE_URL || "/";

  if (ABSOLUTE_URL_PATTERN.test(baseUrl)) {
    return new URL(cleanPath, baseUrl).toString();
  }

  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}${cleanPath}`;
}

export function wasmAssetPath(fileName: string): string {
  return withBasePath(`wasm/${fileName}`);
}
