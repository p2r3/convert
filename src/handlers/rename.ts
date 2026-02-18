import CommonFormats from "src/CommonFormats.ts";
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
  {
    name: "Microsoft Office 365 Presentation",
    format: "pptx",
    extension: "pptx",
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    from: true,
    to: false,
    internal: "pptx",
    category: "presentation"
  },
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
  }
]);
/// handler for renaming text-based formats
export const renameTxtHandler = renameHandler("renametxt", [
  CommonFormats.TEXT.builder("text").allowTo(),
  CommonFormats.JSON.builder("json").allowFrom(),
  CommonFormats.XML.builder("xml").allowFrom(),
  CommonFormats.YML.builder("yaml").allowFrom()
])
