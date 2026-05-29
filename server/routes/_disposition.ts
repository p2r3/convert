import { sanitizeFilename } from "../lib/download.ts";

/** RFC 6266 Content-Disposition: ASCII fallback + UTF-8 form. Sanitizes input. */
export function contentDispositionHeader(rawName: string): string {
  const safe = sanitizeFilename(rawName);
  const ascii = safe.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  const utf8 = encodeURIComponent(safe);
  return `inline; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}
