import CommonFormats, { Category } from "src/CommonFormats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
 
// base class for handling renames
function renameHandler(name: string, formats: FileFormat[]): FormatHandler {
  return {
    name: name,
    ready: true,
    supportedFormats: formats,
    async init() {
      this.ready = true
    },
    async doConvert (
      inputFiles: FileData[],
      inputFormat: FileFormat,
      outputFormat: FileFormat
    ): Promise<FileData[]> {
      return inputFiles.map(file => {
        file.name = file.name.split(".")[0] + "." + outputFormat.extension;
        return file;
      });
    }
  };
}
/// handler for renaming various aliased zip files
export const renameZipHandler = renameHandler("renamezip", [
  CommonFormats.ZIP.builder("zip").allowTo(),
  CommonFormats.DOCX.builder("docx").allowFrom(),
  CommonFormats.XLSX.builder("xlsx").allowFrom(),
  CommonFormats.PPTX.builder("pptx").allowFrom(),
  {
    name: "OpenDocument Text",
    format: "odt",
    extension: "odt",
    mime: "application/vnd.oasis.opendocument.text",
    from: true,
    to: false,
    internal: "odt",
    category: "document"
  },
  {
    name: "OpenDocument Presentation",
    format: "odp",
    extension: "odp",
    mime: "application/vnd.oasis.opendocument.presentation",
    from: true,
    to: false,
    internal: "odp",
    category: "presentation"
  },
  {
    name: "OpenDocument Spreadsheet",
    format: "ods",
    extension: "ods",
    mime: "application/vnd.oasis.opendocument.spreadsheet",
    from: true,
    to: false,
    internal: "ods",
    category: "spreadsheet"
  },
  {
    name: "Firefox Plugin",
    format: "xpi",
    extension: "xpi",
    mime: "application/x-xpinstall",
    from: true,
    to: false,
    internal: "xpi"
  },
  CommonFormats.ZIP.builder("love").allowFrom()
    .withFormat("love").withExt("love").named("LÖVE Game Package"),
  CommonFormats.ZIP.builder("osz").allowFrom()
    .withFormat("osz").withExt("osz").named("osu! Beatmap"),
  CommonFormats.ZIP.builder("osk").allowFrom()
    .withFormat("osk").withExt("osk").named("osu! Skin"),
  CommonFormats.ZIP.builder("apworld").allowFrom()
    .withFormat("apworld").withExt("apworld").named("Archipelago World"),
  {
    name: "Java Archive",
    format: "jar",
    extension: "jar",
    mime: "application/x-java-archive",
    from: true,
    to: false,
    internal: "jar"
  },
  {
    name: "Android Package Archive",
    format: "apk",
    extension: "apk",
    mime: "application/vnd.android.package-archive",
    from: true,
    to: false,
    internal: "apk"
  },
  CommonFormats.ZIP.builder("sb3").allowFrom()
    .withFormat("sb3").withExt("sb3").named("Scratch 3 Project").withMime("application/x.scratch.sb3"),
  CommonFormats.ZIP.builder("ipa").allowFrom()
    .withFormat("ipa").withExt("ipa").named("iOS Application"),
  CommonFormats.ZIP.builder("app").allowFrom()
    .withFormat("app").withExt("app").named("macOS Application Bundle"),
  {
    name: "Comic Book Archive (ZIP)",
    format: "cbz",
    extension: "cbz",
    mime: "application/vnd.comicbook+zip",
    from: true,
    to: false,
    internal: "cbz",
  },
]);
/// handler for renaming text-based formats
export const renameTxtHandler = renameHandler("renametxt", [
  CommonFormats.TEXT.builder("text").allowTo(),
  CommonFormats.JSON.builder("json").allowFrom(),
  CommonFormats.XML.builder("xml").allowFrom(),
  CommonFormats.YML.builder("yaml").allowFrom(),
  // ---- NEW CODE FORMATS ADDED BELOW ----
  {
    name: "Cascading Style Sheets",
    format: "css",
    extension: "css",
    mime: "text/css",
    from: true,
    to: true,
    internal: "css",
    category: "code",
    lossless: true
  },
  {
    name: "Arduino Sketch",
    format: "ino",
    extension: "ino",
    mime: "text/plain",
    from: true,
    to: true,
    internal: "ino",
    category: "code",
    lossless: true
  },
  {
    name: "JavaScript",
    format: "js",
    extension: "js",
    mime: "text/javascript",
    from: true,
    to: true,
    internal: "js",
    category: "code",
    lossless: true
  },
  {
    name: "TypeScript",
    format: "ts",
    extension: "ts",
    mime: "text/typescript",
    from: true,
    to: true,
    internal: "ts",
    category: "code",
    lossless: true
  },
  {
    name: "C++ Source File",
    format: "cpp",
    extension: "cpp",
    mime: "text/x-c++src",
    from: true,
    to: true,
    internal: "cpp",
    category: "code",
    lossless: true
  },
  {
    name: "C Source File",
    format: "c",
    extension: "c",
    mime: "text/x-csrc",
    from: true,
    to: true,
    internal: "c",
    category: "code",
    lossless: true
  },
  {
    name: "C Header File",
    format: "h",
    extension: "h",
    mime: "text/x-chdr",
    from: true,
    to: true,
    internal: "h",
    category: "code",
    lossless: true
  },
  {
    name: "Java",
    format: "java",
    extension: "java",
    mime: "text/x-java-source",
    from: true,
    to: true,
    internal: "java",
    category: "code",
    lossless: true
  },
  {
    name: "PHP",
    format: "php",
    extension: "php",
    mime: "application/x-httpd-php",
    from: true,
    to: true,
    internal: "php",
    category: "code",
    lossless: true
  },
  {
    name: "Ruby",
    format: "rb",
    extension: "rb",
    mime: "text/x-ruby",
    from: true,
    to: true,
    internal: "rb",
    category: "code",
    lossless: true
  },
  {
    name: "Rust",
    format: "rs",
    extension: "rs",
    mime: "text/x-rustsrc",
    from: true,
    to: true,
    internal: "rs",
    category: "code",
    lossless: true
  },
  {
    name: "Go",
    format: "go",
    extension: "go",
    mime: "text/x-go",
    from: true,
    to: true,
    internal: "go",
    category: "code",
    lossless: true
  },
  {
    name: "Lua",
    format: "lua",
    extension: "lua",
    mime: "text/x-lua",
    from: true,
    to: true,
    internal: "lua",
    category: "code",
    lossless: true
  }
])
 
