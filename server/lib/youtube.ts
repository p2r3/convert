const YT_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtu.be",
]);

export function isYouTubeUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    return YT_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

/** Extract the 11-char video id from any YouTube URL form, or null. */
export function youtubeVideoId(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    if (!YT_HOSTS.has(u.hostname)) return null;
    if (u.hostname === "youtu.be" || u.hostname === "www.youtu.be") {
      const id = u.pathname.replace(/^\//, "").split("/")[0];
      return /^[\w-]{11}$/.test(id) ? id : null;
    }
    const v = u.searchParams.get("v");
    if (v && /^[\w-]{11}$/.test(v)) return v;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && (parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "v")) {
      if (/^[\w-]{11}$/.test(parts[1])) return parts[1];
    }
    return null;
  } catch {
    return null;
  }
}

/** Default thumbnail URL (most reliable, no auth required). */
export function youtubeThumbnailUrl(id: string, quality: "max" | "hq" | "mq" | "default" = "max"): string {
  const map = { max: "maxresdefault", hq: "hqdefault", mq: "mqdefault", default: "default" };
  return `https://i.ytimg.com/vi/${id}/${map[quality]}.jpg`;
}
