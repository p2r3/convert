function normalizeMimeType (mime: string) {
  switch (mime) {
    case "audio/x-wav": return "audio/wav";
    case "audio/vnd.wave": return "audio/wav";
    case "application/x-gzip": return "application/gzip";
    case "image/x-icon": return "image/vnd.microsoft.icon";
    case "image/vtf": return "image/x-vtf";
    case "image/qoi": return "image/x-qoi";
    case "video/bink": return "video/vnd.radgamettools.bink";
    case "video/binka": return "audio/vnd.radgamettools.bink";
    case "video/brstm": return "audio/brstm";
    case "audio/x-quicktime": return "video/quicktime";
    case "audio/x-flo": return "audio/flo";
    case "application/x-flo": return "audio/flo";
    case "application/x-lharc": return "application/x-lzh-compressed";
    case "application/lha": return "application/x-lzh-compressed";
    case "application/x-lha": return "application/x-lzh-compressed";
    case "application/x-lzh": return "application/x-lzh-compressed";
    case "audio/x-flac": return "audio/flac";
  }
  return mime;
}

export default normalizeMimeType;
