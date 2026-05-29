import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { ApiError, badRequest, tooLarge } from "./errors.ts";

const DEFAULT_MAX_BYTES = 200 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 60_000;

function ipv4ToBig(ip: string): bigint | null {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return null;
  return (BigInt(parts[0]) << 24n) + (BigInt(parts[1]) << 16n) + (BigInt(parts[2]) << 8n) + BigInt(parts[3]);
}

const PRIVATE_V4_RANGES: Array<[bigint, bigint]> = [
  [ipv4ToBig("10.0.0.0")!, ipv4ToBig("10.255.255.255")!],
  [ipv4ToBig("172.16.0.0")!, ipv4ToBig("172.31.255.255")!],
  [ipv4ToBig("192.168.0.0")!, ipv4ToBig("192.168.255.255")!],
  [ipv4ToBig("127.0.0.0")!, ipv4ToBig("127.255.255.255")!],
  [ipv4ToBig("169.254.0.0")!, ipv4ToBig("169.254.255.255")!],
  [ipv4ToBig("0.0.0.0")!, ipv4ToBig("0.255.255.255")!],
  [ipv4ToBig("100.64.0.0")!, ipv4ToBig("100.127.255.255")!],
];

function isPrivateV4(ip: string): boolean {
  const n = ipv4ToBig(ip);
  if (n === null) return false;
  for (const [low, high] of PRIVATE_V4_RANGES) {
    if (n >= low && n <= high) return true;
  }
  return false;
}

function isPrivateV6(ip: string): boolean {
  const lc = ip.toLowerCase();
  if (lc === "::1" || lc === "::") return true;
  if (lc.startsWith("fc") || lc.startsWith("fd")) return true; // unique local
  if (lc.startsWith("fe80")) return true; // link-local
  if (lc.startsWith("::ffff:")) {
    const v4 = lc.slice(7);
    if (isIP(v4) === 4 && isPrivateV4(v4)) return true;
  }
  return false;
}

export async function assertSafeUrl(rawUrl: string, allowPrivate = false): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw badRequest(`Invalid URL: ${rawUrl}`);
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw badRequest(`Only http(s) URLs are allowed (got ${url.protocol})`);
  }
  if (allowPrivate) return url;

  const host = url.hostname.replace(/^\[|\]$/g, "");
  const v = isIP(host);
  if (v === 4) {
    if (isPrivateV4(host)) throw badRequest(`Refusing to fetch private IP: ${host}`);
    return url;
  }
  if (v === 6) {
    if (isPrivateV6(host)) throw badRequest(`Refusing to fetch private IPv6: ${host}`);
    return url;
  }
  try {
    const addrs = await dnsLookup(host, { all: true });
    for (const a of addrs) {
      if (a.family === 4 && isPrivateV4(a.address)) {
        throw badRequest(`Refusing to fetch host that resolves to private IP: ${host} → ${a.address}`);
      }
      if (a.family === 6 && isPrivateV6(a.address)) {
        throw badRequest(`Refusing to fetch host that resolves to private IPv6: ${host} → ${a.address}`);
      }
    }
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw badRequest(`DNS lookup failed for ${host}`);
  }
  return url;
}

export interface DownloadResult {
  bytes: Uint8Array;
  contentType: string | null;
  fileName: string;
  url: string;
}

export async function downloadUrl(
  rawUrl: string,
  opts: { maxBytes?: number; timeoutMs?: number; allowPrivate?: boolean; maxRedirects?: number } = {},
): Promise<DownloadResult> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = opts.maxRedirects ?? 5;

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);

  try {
    // Manually follow redirects so each hop goes through assertSafeUrl.
    let url = await assertSafeUrl(rawUrl, opts.allowPrivate);
    let res: Response;
    let hops = 0;
    while (true) {
      res = await fetch(url, {
        redirect: "manual",
        signal: ctl.signal,
        headers: {
          "user-agent":
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 convert-api",
        },
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) break;
        if (++hops > maxRedirects) throw badRequest(`Too many redirects (>${maxRedirects})`);
        const nextRaw = new URL(loc, url).href;
        // Drain prior body before reusing the connection.
        await res.body?.cancel();
        url = await assertSafeUrl(nextRaw, opts.allowPrivate);
        continue;
      }
      break;
    }
    if (!res.ok) {
      throw badRequest(`Upstream ${res.status} fetching ${url.href}`);
    }
    const contentLengthStr = res.headers.get("content-length");
    if (contentLengthStr) {
      const cl = Number(contentLengthStr);
      if (Number.isFinite(cl) && cl > maxBytes) {
        throw tooLarge(`Remote file too large: ${cl} > ${maxBytes}`);
      }
    }
    const reader = res.body?.getReader();
    if (!reader) throw badRequest("Empty response body");
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          throw tooLarge(`Remote file exceeded ${maxBytes} bytes`);
        }
        chunks.push(value);
      }
    }
    const buf = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      buf.set(c, off);
      off += c.byteLength;
    }
    return {
      bytes: buf,
      contentType: res.headers.get("content-type"),
      fileName: deriveFileName(url, res.headers.get("content-disposition")),
      url: url.href,
    };
  } finally {
    clearTimeout(timer);
  }
}

function deriveFileName(url: URL, contentDisposition: string | null): string {
  let candidate: string | null = null;
  if (contentDisposition) {
    const m = /filename\*?=(?:UTF-8'')?"?([^";\r\n]+)"?/i.exec(contentDisposition);
    if (m && m[1]) {
      try {
        candidate = decodeURIComponent(m[1]);
      } catch {
        candidate = m[1];
      }
    }
  }
  if (!candidate) {
    const last = url.pathname.split("/").filter(Boolean).pop();
    if (last) {
      try {
        candidate = decodeURIComponent(last);
      } catch {
        candidate = last;
      }
    }
  }
  return sanitizeFilename(candidate || "download.bin");
}

/** Strip path separators, control chars, and `..` to prevent traversal/injection. */
export function sanitizeFilename(name: string): string {
  // Remove control characters (including CR/LF for header safety) and path separators.
  let out = name.replace(/[\x00-\x1f\x7f\\/:*?"<>|]/g, "_");
  // Strip leading dots / parent refs.
  out = out.replace(/^\.+/, "");
  // Cap length to avoid pathological inputs.
  if (out.length > 200) {
    const dot = out.lastIndexOf(".");
    const ext = dot > 0 && out.length - dot <= 10 ? out.slice(dot) : "";
    out = out.slice(0, 200 - ext.length) + ext;
  }
  return out || "download.bin";
}
