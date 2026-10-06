import { FormatDefinition } from "src/FormatHandler";

export const Category = {
  IMAGE: "image",
  VECTOR: "vector",
  VIDEO: "video",
  AUDIO: "audio",
  TEXT: "text",
  DATA: "data",
  CODE: "code",
  DOCUMENT: "document",
  SPREADSHEET: "spreadsheet",
  PRESENTATION: "presentation",
  ARCHIVE: "archive",
  FONT: "font",
  MODEL: "model",
  DATABASE: "database",
} as const;

export type CategoryType = (typeof Category)[keyof typeof Category];

const categoryValues: ReadonlySet<string> = new Set(Object.values(Category));

export function isCategory(value: string): value is CategoryType {
  return categoryValues.has(value);
}

/**
 * All formats used in all handlers, except dynamic ones
 */
// oxfmt-ignore
const Formats = {
  // images
  PNG: new FormatDefinition("Portable Network Graphics", "png", "png", "image/png", Category.IMAGE),
  APNG: new FormatDefinition("Animated Portable Network Graphics", "apng", "apng", "image/png", Category.IMAGE),
  JPEG: new FormatDefinition("Joint Photographic Experts Group JFIF", "jpeg", "jpg", "image/jpeg", Category.IMAGE),
  WEBP: new FormatDefinition("WebP", "webp", "webp", "image/webp", Category.IMAGE),
  GIF: new FormatDefinition("CompuServe Graphics Interchange Format (GIF)", "gif", "gif", "image/gif", [Category.IMAGE, Category.VIDEO]),
  BMP: new FormatDefinition("Microsoft Windows bitmap image", "bmp", "bmp", "image/bmp", Category.IMAGE),
  TIFF: new FormatDefinition("Tagged Image File Format", "tiff", "tiff", "image/tiff", Category.IMAGE),
  QOI: new FormatDefinition("Quite OK Image", "qoi", "qoi", "image/x-qoi", Category.IMAGE),
  OTA: new FormatDefinition("Over The Air bitmap", "ota", "otb", "image/x-ota", Category.IMAGE),
  RGB: new FormatDefinition("Raw red, green, and blue samples", "rgb", "rgb", "image/x-rgb", Category.IMAGE),
  RGBA: new FormatDefinition("Raw red, green, blue, and alpha samples", "rgba", "rgba", "image/x-rgba", Category.IMAGE),
  CGBI_PNG: new FormatDefinition("iPhone optimized CgBI PNG", "cgbi-png", "png", "image/png", Category.IMAGE),
  PNM: new FormatDefinition("Portable anymap", "pnm", "pnm", "image/x-portable-pixmap", Category.IMAGE),
  PGM: new FormatDefinition("Portable graymap format (gray scale)", "pgm", "pgm", "image/x-portable-greymap", Category.IMAGE),
  PPM: new FormatDefinition("Portable pixmap format (color)", "ppm", "ppm", "image/x-portable-pixmap", Category.IMAGE),
  PAM: new FormatDefinition("Portable arbitrary map", "pam", "pam", "image/x-portable-anymap", Category.IMAGE),
  PBM: new FormatDefinition("Portable bitmap format (black and white)", "pbm", "pbm", "image/x-portable-bitmap", Category.IMAGE),
  PKM: new FormatDefinition("Portable arbitrary map (CMYK)", "pkm", "pkm", "image/x-portable-arbitrarymap", Category.IMAGE),
  PCL: new FormatDefinition("Printer Command Language", "pcl", "pcl", "application/vnd.hp-pcl", Category.DOCUMENT),
  PCLM: new FormatDefinition("PCLm raster", "pclm", "pclm", "application/PCLm", Category.DOCUMENT),
  PS: new FormatDefinition("PostScript", "ps", "ps", "application/postscript", Category.DOCUMENT),
  PWG: new FormatDefinition("PWG raster", "pwg", "pwg", "image/pwg-raster", Category.IMAGE),
  JXR: new FormatDefinition("JPEG XR", "jxr", "jxr", "image/jxr", Category.IMAGE),
  JBIG2: new FormatDefinition("Joint Bi-level Image experts Group (JBIG2)", "jbig2", "jb2", "image/x-jbig2", Category.IMAGE),
  // images - icons and cursors
  ICO: new FormatDefinition("Microsoft Windows ICO", "ico", "ico", "image/vnd.microsoft.icon", Category.IMAGE),
  CUR: new FormatDefinition("Microsoft Windows CUR", "cur", "cur", "image/vnd.microsoft.icon", Category.IMAGE),
  ANI: new FormatDefinition("Microsoft Windows ANI", "ani", "ani", "application/x-navi-animation", Category.IMAGE),
  ICNS: new FormatDefinition("Apple Icon Image", "icns", "icns", "image/icns", Category.IMAGE),
  XCUR: new FormatDefinition("X11 cursor", "xcur", "", "image/x-x11-cursor", Category.IMAGE),
  // images - editor projects
  XCF: new FormatDefinition("eXperimental Computing Facility (GIMP)", "xcf", "xcf", "image/x-xcf", Category.IMAGE),
  KRA: new FormatDefinition("Krita Raster Archive (KRA)", "kra", "kra", "application/x-krita", Category.ARCHIVE),
  KRZ: new FormatDefinition("Krita Raster Archive (krz)", "krz", "krz", "application/x-krita", Category.ARCHIVE),
  ASEPRITE: new FormatDefinition("Aseprite Sprite", "aseprite", "aseprite", "image/x-aseprite", Category.IMAGE),
  PISKEL: new FormatDefinition("Piskel Sprite Save File", "piskel", "piskel", "image/png+json", Category.IMAGE),
  // images - game textures
  VTF: new FormatDefinition("Valve Texture Format", "vtf", "vtf", "image/x-vtf", Category.IMAGE),
  APF: new FormatDefinition("Aperture Picture Format", "apf", "apf", "image/x-aperture-picture", Category.IMAGE),
  RPGMVP: new FormatDefinition("RPG Maker MV PNG (RPGMVP)", "rpgmvp", "rpgmvp", "application/x-rpgmvp", Category.IMAGE),

  // vector
  EMF: new FormatDefinition("Enhanced Metafile", "emf", "emf", "image/emf", [Category.IMAGE, Category.VECTOR, Category.DOCUMENT]),
  SVG: new FormatDefinition("Scalable Vector Graphics", "svg", "svg", "image/svg+xml", [Category.IMAGE, Category.VECTOR, Category.DOCUMENT]),

  // video
  MP4: new FormatDefinition("MPEG-4 Part 14", "mp4", "mp4", "video/mp4", Category.VIDEO),
  WMV: new FormatDefinition("Windows Media Video", "wmv", "wmv", "video/x-ms-asf", Category.VIDEO),
  MTS: new FormatDefinition("AVCHD Video", "mts", "mts", "video/mp2t", Category.VIDEO),
  M2TS: new FormatDefinition("Blu-ray BDMV Video", "m2ts", "m2ts", "video/mp2t", Category.VIDEO),

  // audio
  MP3: new FormatDefinition("MP3 Audio", "mp3", "mp3", "audio/mpeg", Category.AUDIO),
  WAV: new FormatDefinition("Waveform Audio File Format", "wav", "wav", "audio/wav", Category.AUDIO),
  OGG: new FormatDefinition("Ogg Audio", "ogg", "ogg", "audio/ogg", Category.AUDIO),
  OGG_VORBIS: new FormatDefinition("Ogg Vorbis Audio", "ogg-vorbis", "ogg", "audio/ogg", Category.AUDIO),
  OGG_OPUS: new FormatDefinition("Ogg Opus Audio", "ogg-opus", "ogg", "audio/ogg", Category.AUDIO),
  FLAC: new FormatDefinition("Free Lossless Audio Codec", "flac", "flac", "audio/flac", Category.AUDIO),
  QTA: new FormatDefinition("QuickTime Audio", "qta", "qta", "video/quicktime", Category.AUDIO),
  QOA: new FormatDefinition("Quite OK Audio", "qoa", "qoa", "audio/x-qoa", Category.AUDIO),
  FLO: new FormatDefinition("Flo Audio", "flo", "flo", "audio/flo", Category.AUDIO),
  // audio - raw PCM
  U8: new FormatDefinition("PCM unsigned 8-bit", "u8", "u8", "audio/u8", Category.AUDIO),
  S16LE: new FormatDefinition("PCM signed 16-bit little-endian", "s16le", "s16le", "audio/s16le", Category.AUDIO),
  S24LE: new FormatDefinition("PCM signed 24-bit little-endian", "s24le", "s24le", "audio/s24le", Category.AUDIO),
  S32LE: new FormatDefinition("PCM signed 32-bit little-endian", "s32le", "s32le", "audio/s32le", Category.AUDIO),
  F32LE: new FormatDefinition("PCM 32-bit floating-point little-endian", "f32le", "f32le", "audio/f32le", Category.AUDIO),
  F64LE: new FormatDefinition("PCM 64-bit floating-point little-endian", "f64le", "f64le", "audio/f64le", Category.AUDIO),
  // audio - sequenced music
  MIDI: new FormatDefinition("MIDI", "mid", "mid", "audio/midi", Category.AUDIO),
  RTTTL: new FormatDefinition("RTTTL", "rtttl", "rtttl", "audio/rtttl", Category.TEXT),
  NOKRING: new FormatDefinition("NokRing", "rtttl", "nokring", "audio/rtttl", Category.TEXT),
  GRUB: new FormatDefinition("GRUB Init Tune", "grub", "grub", "text/plain", Category.TEXT),
  // audio - DAW projects
  FLP: new FormatDefinition("FL Studio Project File", "flp", "flp", "application/octet-stream", Category.AUDIO),
  ALS: new FormatDefinition("Ableton Live Set", "als", "als", "application/gzip", Category.DATA),

  // text
  TEXT: new FormatDefinition("Plain Text", "text", "txt", "text/plain", Category.TEXT),
  TEXT_UTF8_NO_BOM: new FormatDefinition("Plain Text (UTF-8 without BOM)", "UTF-8 without BOM", "txt", "text/plain; charset=UTF-8 without BOM", Category.TEXT),
  TEXT_UTF8_BOM: new FormatDefinition("Plain Text (UTF-8 with BOM)", "UTF-8 with BOM", "txt", "text/plain; charset=UTF-8 with BOM", Category.TEXT),
  TEXT_UTF16LE: new FormatDefinition("Plain Text (UTF-16 LE)", "UTF-16 LE", "txt", "text/plain; charset=UTF-16LE", Category.TEXT),
  TEXT_UTF16BE: new FormatDefinition("Plain Text (UTF-16 BE)", "UTF-16 BE", "txt", "text/plain; charset=UTF-16BE", Category.TEXT),
  TEXT_UTF32LE: new FormatDefinition("Plain Text (UTF-32 LE)", "UTF-32 LE", "txt", "text/plain; charset=UTF-32LE", Category.TEXT),
  TEXT_UTF32BE: new FormatDefinition("Plain Text (UTF-32 BE)", "UTF-32 BE", "txt", "text/plain; charset=UTF-32BE", Category.TEXT),

  // data
  JSON: new FormatDefinition("JavaScript Object Notation", "json", "json", "application/json", Category.DATA),
  JSONL: new FormatDefinition("JSON Lines", "jsonl", "jsonl", "application/jsonl", Category.DATA),
  JSON5: new FormatDefinition("JSON5", "json5", "json5", "application/json5", Category.DATA),
  JSONC: new FormatDefinition("JSON Comments", "jsonc", "jsonc", "application/jsonc", Category.DATA),
  BSON: new FormatDefinition("Binary JSON", "bson", "bson", "application/bson", Category.DATA),
  TOON: new FormatDefinition("Token-Oriented Object Notation", "toon", "toon", "text/toon", Category.DATA),
  XML: new FormatDefinition("Extensible Markup Language", "xml", "xml", "application/xml", Category.DATA),
  YML: new FormatDefinition("YAML Ain't Markup Language", "yaml", "yml", "application/yaml", Category.DATA),
  TOML: new FormatDefinition("Tom's Obvious, Minimal Language", "toml", "toml", "application/toml", Category.DATA),
  INI: new FormatDefinition("Initialization file", "ini", "ini", "text/plain", Category.DATA),
  CSV: new FormatDefinition("Comma Separated Values", "csv", "csv", "text/csv", Category.DATA),

  // code
  PYTHON: new FormatDefinition("Python Script", "py", "py", "text/x-python", Category.CODE),
  JS: new FormatDefinition("Javascript Source File", "js", "js", "text/javascript", Category.CODE),
  C: new FormatDefinition("C Source File", "c", "c", "text/x-c", Category.CODE),
  CPP: new FormatDefinition("C++ Source File", "cpp", "cpp", "text/x-c++src", Category.CODE),
  CSHARP: new FormatDefinition("C# Source File", "cs", "cs", "text/csharp", Category.CODE),
  GO: new FormatDefinition("Go Source File", "go", "go", "text/x-go", Category.CODE),
  RUST: new FormatDefinition("Rust Source File", "rs", "rs", "text/rust", Category.CODE),
  ASM: new FormatDefinition("Assembly Source File", "asm", "s", "text/x-asm", Category.CODE),
  CSS: new FormatDefinition("CSS Stylesheet", "css", "css", "text/css", Category.CODE),
  LESS: new FormatDefinition("LESS Stylesheet", "less", "less", "text/less", Category.CODE),
  SCSS: new FormatDefinition("SCSS Stylesheet", "scss", "scss", "text/x-scss", Category.CODE),
  SH: new FormatDefinition("Shell Script", "sh", "sh", "application/x-sh", Category.TEXT),
  BATCH: new FormatDefinition("Windows Batch file", "batch", "bat", "text/windows-batch", Category.TEXT),
  // code - binaries
  WASM: new FormatDefinition("WebAssembly Binary (Wasm)", "wasm", "wasm", "application/wasm", Category.CODE),
  // https://github.com/WebAssembly/spec/issues/1347
  WAT: new FormatDefinition("WebAssembly Text Format (WAT)", "wat", "wat", "text/plain", Category.CODE),
  EXE: new FormatDefinition("Windows Portable Executable", "exe", "exe", "application/vnd.microsoft.portable-executable", Category.CODE),
  DLL: new FormatDefinition("Dynamic-Link Library", "dll", "dll", "application/vnd.microsoft.portable-executable", Category.CODE),
  ELF: new FormatDefinition("x86-64 Linux Executable and Linkable Format", "elf", "elf", "application/x-elf", Category.CODE),

  // documents
  HTML: new FormatDefinition("Hypertext Markup Language", "html", "html", "text/html", [Category.DOCUMENT, Category.TEXT]),
  XHTML: new FormatDefinition("Extensible Hypertext Markup Language", "xhtml", "xhtml", "application/xhtml+xml", [Category.DOCUMENT, Category.TEXT]),
  MD: new FormatDefinition("Markdown Document", "markdown", "markdown", "text/markdown", [Category.DOCUMENT, Category.TEXT]),
  TYPST: new FormatDefinition("Typst Document", "typst", "typ", "text/typst", [Category.DOCUMENT, Category.TEXT]),
  PDF: new FormatDefinition("Portable Document Format", "pdf", "pdf", "application/pdf", Category.DOCUMENT),
  // documents - e-books
  EPUB: new FormatDefinition("Electronic Publication", "epub", "epub", "application/epub+zip", Category.DOCUMENT),
  AZW3: new FormatDefinition("Amazon Kindle Format 8", "azw3", "azw3", "application/vnd.amazon.mobi8-ebook", Category.DOCUMENT),
  MOBI: new FormatDefinition("Mobipocket e-book", "mobi", "mobi", "application/x-mobipocket-ebook", Category.DOCUMENT),
  FB2: new FormatDefinition("FictionBook 2", "fb2", "fb2", "application/x-fictionbook+xml", Category.DOCUMENT),
  // documents - office
  DOCX: new FormatDefinition("WordprocessingML Document", "docx", "docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", Category.DOCUMENT),
  XLSX: new FormatDefinition("SpreadsheetML Workbook", "xlsx", "xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", [Category.SPREADSHEET, Category.DOCUMENT]),
  PPTX: new FormatDefinition("PresentationML Presentation", "pptx", "pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation", [Category.PRESENTATION, Category.DOCUMENT]),
  ODT: new FormatDefinition("OpenDocument Text", "odt", "odt", "application/vnd.oasis.opendocument.text", Category.DOCUMENT),
  ODS: new FormatDefinition("OpenDocument Spreadsheet", "ods", "ods", "application/vnd.oasis.opendocument.spreadsheet", Category.SPREADSHEET),
  ODP: new FormatDefinition("OpenDocument Presentation", "odp", "odp", "application/vnd.oasis.opendocument.presentation", Category.PRESENTATION),
  HWPX: new FormatDefinition("Hancom Office Hangul Document", "hwpx", "hwpx", "application/vnd.hancom.hwpx", Category.DOCUMENT),
  // documents - music notation
  MUSICXML: new FormatDefinition("MusicXML", "musicxml", "musicxml", "application/vnd.recordare.musicxml+xml", Category.DOCUMENT),
  MXL: new FormatDefinition("MusicXML Compressed", "mxl", "mxl", "application/vnd.recordare.musicxml", Category.DOCUMENT),
  // documents - chess notation
  FEN: new FormatDefinition("Forsyth–Edwards Notation", "fen", "fen", "application/vnd.chess-fen", Category.TEXT),
  PGN: new FormatDefinition("Portable Game Notation", "pgn", "pgn", "application/vnd.chess-pgn", Category.TEXT),

  // archives
  ZIP: new FormatDefinition("ZIP Archive", "zip", "zip", "application/zip", Category.ARCHIVE),
  TAR: new FormatDefinition("Tape Archive", "tar", "tar", "application/x-tar", Category.ARCHIVE),
  RAR: new FormatDefinition("Rar Archive", "rar", "rar", "application/vnd.rar", Category.ARCHIVE),
  SZ: new FormatDefinition("7z Archive", "7z", "7z", "application/x-7z-compressed", Category.ARCHIVE),
  LZH: new FormatDefinition("LZH/LHA Archive", "lzh", "lzh", "application/x-lzh-compressed", Category.ARCHIVE),
  HAR: new FormatDefinition("HTTP Archive", "har", "har", "application/har+json", Category.ARCHIVE),
  // archives - comic books
  CBZ: new FormatDefinition("Comic Book Archive (ZIP)", "cbz", "cbz", "application/vnd.comicbook+zip", Category.ARCHIVE),
  CBT: new FormatDefinition("Comic Book Archive (TAR)", "cbt", "cbt", "application/vnd.comicbook+tar", Category.ARCHIVE),
  CBR: new FormatDefinition("Comic Book Archive (RAR)", "cbr", "cbr", "application/vnd.comicbook+rar", Category.ARCHIVE),
  CB7: new FormatDefinition("Comic Book Archive (7Z)", "cb7", "cb7", "application/vnd.comicbook+7z", Category.ARCHIVE),
  // archives - application packages
  JAR: new FormatDefinition("Java Archive", "jar", "jar", "application/x-java-archive", Category.ARCHIVE),
  APK: new FormatDefinition("Android Package Archive", "apk", "apk", "application/vnd.android.package-archive", Category.ARCHIVE),
  IPA: new FormatDefinition("iOS Application", "ipa", "ipa", "application/zip", Category.ARCHIVE),
  APP: new FormatDefinition("macOS Application Bundle", "app", "app", "application/zip", Category.ARCHIVE),
  XPI: new FormatDefinition("Firefox Plugin", "xpi", "xpi", "application/x-xpinstall", Category.ARCHIVE),

  // fonts
  TTF: new FormatDefinition("TrueType Font", "ttf", "ttf", "font/ttf", [Category.FONT]),
  OTF: new FormatDefinition("OpenType Font", "otf", "otf", "font/otf", [Category.FONT]),
  WOFF: new FormatDefinition("Web Open Font Format", "woff", "woff", "font/woff", [Category.FONT]),
  WOFF2: new FormatDefinition("Web Open Font Format 2.0", "woff2", "woff2", "font/woff2", [Category.FONT]),

  // 3D models
  GLB: new FormatDefinition("GL Transmission Format Binary", "glb", "glb", "model/gltf-binary", Category.MODEL),
  GLTF: new FormatDefinition("GL Transmission Format", "gltf", "gltf", "model/gltf+json", Category.MODEL),
  OBJ: new FormatDefinition("Wavefront OBJ", "obj", "obj", "model/obj", Category.MODEL),
  BBMODEL: new FormatDefinition("Blockbench Project", "bbmodel", "bbmodel", "application/json", Category.MODEL),

  // databases
  SQLITE3: new FormatDefinition("SQLite3", "sqlite3", "db", "application/vnd.sqlite3", Category.DATABASE),
  ITDB: new FormatDefinition("iTunes Database", "itdb", "itdb", "application/vnd.sqlite3", Category.DATABASE),

  // games - Minecraft
  NBT: new FormatDefinition("Named Binary Tag", "nbt", "nbt", "application/x-minecraft-nbt", Category.DATA),
  SNBT: new FormatDefinition("String Named Binary Tag", "snbt", "snbt", "application/x-minecraft-snbt", Category.DATA),
  MC_SCHEMATIC: new FormatDefinition("Minecraft Schematic", "schematic", "schematic", "application/x-minecraft-schematic", Category.DATA),
  MC_SCHEM: new FormatDefinition("Sponge Schematic", "schem", "schem", "application/x-minecraft-schem", Category.DATA),
  MC_LITEMATIC: new FormatDefinition("Litematica Schematic", "litematic", "litematic", "application/x-minecraft-litematic", Category.DATA),
  MC_MAP: new FormatDefinition("Minecraft Map File", "mcmap", "dat", "application/x-minecraft-map", Category.DATA),
  MC_MAP_GRID: new FormatDefinition("Minecraft Map File (Grid)", "mcmap_grid", "dat", "application/x-minecraft-map", Category.DATA),
  MC_LANG: new FormatDefinition("Minecraft Language Localization File", "minecraft-lang", "lang", "text/plain", Category.TEXT),
  BRARCHIVE: new FormatDefinition("Minecraft Bedrock Archive", "brarchive", "brarchive", "image/x-brarchive", Category.ARCHIVE),
  MRPACK: new FormatDefinition("Modrinth Modpack", "mrpack", "mrpack", "application/x-modrinth-modpack+zip", Category.ARCHIVE),
  // games - packages
  SB3: new FormatDefinition("Scratch 3 Project", "sb3", "sb3", "application/x.scratch.sb3", Category.ARCHIVE),
  LOVE: new FormatDefinition("LÖVE Game Package", "love", "love", "application/zip", Category.ARCHIVE),
  OSZ: new FormatDefinition("osu! Beatmap", "osz", "osz", "application/zip", Category.ARCHIVE),
  OSK: new FormatDefinition("osu! Skin", "osk", "osk", "application/zip", Category.ARCHIVE),
  APWORLD: new FormatDefinition("Archipelago World", "apworld", "apworld", "application/zip", Category.ARCHIVE),
  WAD: new FormatDefinition("Doom WAD Archive", "wad", "wad", "application/x-doom-wad", Category.ARCHIVE),
  // games - ROMs
  Z64: new FormatDefinition("Nintendo 64 ROM (Big Endian)", "z64", "z64", "application/x-n64-rom", Category.DATA),
  N64: new FormatDefinition("Nintendo 64 ROM (Little Endian)", "n64", "n64", "application/x-n64-rom", Category.DATA),
  V64: new FormatDefinition("Nintendo 64 ROM (Byte-swapped)", "v64", "v64", "application/x-n64-rom", Category.DATA),
  // games - saves, levels and replays
  TERRARIA_WLD: new FormatDefinition("Terraria World", "wld", "wld", "application/x-terraria-world", Category.DATA),
  PORTAL2_DEM: new FormatDefinition("Portal 2 Demo File", "dem", "dem", "application/x-portal2-demo", Category.DATA),
  BSOR: new FormatDefinition("Beat Saber Open Replay", "bsor", "bsor", "application/x-bsor", Category.DATA),
  CGP: new FormatDefinition("ULTRAKILL CyberGrind Pattern", "cgp", "cgp", "text/plain", Category.DATA),
  INFINITE_CRAFT: new FormatDefinition("Infinite Craft Save File", "ic", "ic", "application/x-infinite-craft-ic", Category.ARCHIVE),
  BUNLEVEL: new FormatDefinition("Pâquerette: Down the Bunburrows Level File", "bunlevel", "level", "application/x-bunburrows-level", Category.DATA),
  ECMAP: new FormatDefinition("Editable Celaria Map", "ecmap", "ecmap", "application/x-editable-celaria-map", Category.DATA),
  CMAP: new FormatDefinition("Celaria Map", "cmap", "cmap", "application/x-celaria-map", Category.DATA),
  OM_PUZZLE: new FormatDefinition("Opus Magnum puzzle", "puzzle", "puzzle", "application/x-opus-magnum-puzzle", Category.DATA),
  OM_MOLECULE: new FormatDefinition("Opus Magnum molecule", "molecule", "molecule", "application/x-opus-magnum-molecule", Category.DATA),
};

export default Formats;
