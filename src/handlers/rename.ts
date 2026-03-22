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
    async doConvert(
      inputFiles: FileData[],
      inputFormat: FileFormat,
      outputFormat: FileFormat
    ): Promise<FileData[]> {
      return inputFiles.map(file => {
        file.name = file.name.split(".").slice(0, -1).join(".") + "." + outputFormat.extension;
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
    category: Category.DOCUMENT,
    lossless: true
  },
  {
    name: "OpenDocument Presentation",
    format: "odp",
    extension: "odp",
    mime: "application/vnd.oasis.opendocument.presentation",
    from: true,
    to: false,
    internal: "odp",
    category: Category.PRESENTATION,
    lossless: true
  },
  {
    name: "OpenDocument Spreadsheet",
    format: "ods",
    extension: "ods",
    mime: "application/vnd.oasis.opendocument.spreadsheet",
    from: true,
    to: false,
    internal: "ods",
    category: Category.SPREADSHEET,
    lossless: true
  },
  {
    name: "Firefox Plugin",
    format: "xpi",
    extension: "xpi",
    mime: "application/x-xpinstall",
    from: true,
    to: false,
    internal: "xpi",
    category: Category.ARCHIVE,
    lossless: true
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
    internal: "jar",
    category: Category.ARCHIVE,
    lossless: true
  },
  {
    name: "Android Package Archive",
    format: "apk",
    extension: "apk",
    mime: "application/vnd.android.package-archive",
    from: true,
    to: false,
    internal: "apk",
    category: Category.ARCHIVE,
    lossless: true
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
    category: Category.ARCHIVE,
    lossless: true
  },
]);
/// handler for renaming text-based formats
export const renameTxtHandler = renameHandler("renametxt", [
  CommonFormats.TEXT.builder("text").allowTo(),
  CommonFormats.JSON.builder("json").allowFrom(),
  CommonFormats.XML.builder("xml").allowFrom(),
  CommonFormats.YML.builder("yaml").allowFrom()
]);
/// handler for renaming json-based formats
export const renameJsonHandler = renameHandler("renamejson", [
  CommonFormats.JSON.builder("json").allowTo(),
  {
    name: "HTTP Archive",
    format: "har",
    extension: "har",
    mime: "application/har+json",
    from: true,
    to: false,
    category: Category.ARCHIVE,
    internal: "har"
  },
  {
    name: "Piskel Sprite Save File",
    format: "piskel",
    extension: "piskel",
    mime: "image/png+json",
    from: true,
    to: false,
    category: Category.IMAGE,
    internal: "piskel",
    lossless: true
  }
]);
/// handler for renaming tar-based formats
export const renameTarHandler = renameHandler("renametar", [
  CommonFormats.TAR.builder("tar").allowTo(),
  {
    name: "Comic Book Archive (TAR)",
    format: "cbt",
    extension: "cbt",
    mime: "application/vnd.comicbook+tar",
    from: true,
    to: false,
    internal: "cbt",
    category: Category.ARCHIVE,
    lossless: true
  },
]);
/// handler for renaming rar-based formats
export const renameRarHandler = renameHandler("renamerar", [
  CommonFormats.RAR.builder("rar").allowTo(),
  {
    name: "Comic Book Archive (RAR)",
    format: "cbr",
    extension: "cbr",
    mime: "application/vnd.comicbook+rar",
    from: true,
    to: false,
    internal: "cbr",
    category: Category.ARCHIVE,
    lossless: true
  },
]);
/// handler for renaming 7z-based formats
export const rename7zHandler = renameHandler("rename7z", [
  CommonFormats.SZ.builder("7z").allowTo(),
  {
    name: "Comic Book Archive (7Z)",
    format: "cb7",
    extension: "cb7",
    mime: "application/vnd.comicbook+7z",
    from: true,
    to: false,
    internal: "cb7",
    category: Category.ARCHIVE,
    lossless: true
  },
]);