function normalizeMimeType (mime: string) {
  switch (mime) {
    case "audio/x-wav": return "audio/wav";
    case "audio/vnd.wave": return "audio/wav";
    case "image/x-icon": return "image/vnd.microsoft.icon";
    case "image/qoi": return "image/x-qoi";
    case "video/bink": return "video/vnd.radgamettools.bink";
    case "video/binka": return "audio/vnd.radgamettools.bink";
    case "text/x-asciidoc": return "text/asciidoc";
    case "application/asciidoc": return "text/asciidoc";
  }
  return mime;
}

export default normalizeMimeType;
