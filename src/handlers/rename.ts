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
  CommonFormats.ZIP.builder("zip").allowTo().markLossless(),
  CommonFormats.DOCX.builder("docx").allowFrom().markLossless(),
  CommonFormats.XLSX.builder("xlsx").allowFrom().markLossless(),
  CommonFormats.PPTX.builder("pptx").allowFrom().markLossless(),
  {
    name: "OpenDocument Text",
    format: "odt",
    extension: "odt",
    mime: "application/vnd.oasis.opendocument.text",
    from: true,
    to: false,
    internal: "odt",
    category: "document",
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
    category: "presentation",
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
    category: "spreadsheet",
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
    category: "archive",
    lossless: true
  },
  CommonFormats.ZIP.builder("love").allowFrom().markLossless()
    .withFormat("love").withExt("love").named("LÖVE Game Package"),
  CommonFormats.ZIP.builder("osz").allowFrom().markLossless()
    .withFormat("osz").withExt("osz").named("osu! Beatmap"),
  CommonFormats.ZIP.builder("osk").allowFrom().markLossless()
    .withFormat("osk").withExt("osk").named("osu! Skin"),
  CommonFormats.ZIP.builder("apworld").allowFrom().markLossless()
    .withFormat("apworld").withExt("apworld").named("Archipelago World"),
  {
    name: "Java Archive",
    format: "jar",
    extension: "jar",
    mime: "application/x-java-archive",
    from: true,
    to: false,
    internal: "jar",
    category: "archive",
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
    category: "archive",
    lossless: true
  },
  CommonFormats.ZIP.builder("sb3").allowFrom().markLossless()
    .withFormat("sb3").withExt("sb3").named("Scratch 3 Project"),
  CommonFormats.ZIP.builder("ipa").allowFrom().markLossless()
    .withFormat("ipa").withExt("ipa").named("iOS Application"),
  CommonFormats.ZIP.builder("app").allowFrom().markLossless()
    .withFormat("app").withExt("app").named("macOS Application Bundle")
]);
/// handler for renaming text-based formats
export const renameTxtHandler = renameHandler("renametxt", [
  CommonFormats.TEXT.builder("text").allowTo().markLossless(),
  CommonFormats.JSON.builder("json").allowFrom().markLossless(),
  CommonFormats.XML.builder("xml").allowFrom().markLossless(),
  CommonFormats.YML.builder("yaml").allowFrom().markLossless()
])
