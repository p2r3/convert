import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

class renameHandler implements FormatHandler {

  public name: string = "rename";

  public supportedFormats: FileFormat[] = [
    {
      name: "ZIP Archive",
      format: "zip",
      extension: "zip",
      mime: "application/zip",
      from: false,
      to: true,
      internal: "zip"
    },
    {
      name: "Microsoft Office 365 Word Document",
      format: "docx",
      extension: "docx",
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      from: true,
      to: false,
      internal: "docx"
    },
    {
      name: "Microsoft Office 365 Workbook",
      format: "xlsx",
      extension: "xlsx",
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      from: true,
      to: false,
      internal: "xlsx"
    },
    {
      name: "Microsoft Office 365 Presentation",
      format: "pptx",
      extension: "pptx",
      mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      from: true,
      to: false,
      internal: "pptx"
    },
    {
      name: "OpenDocument Text",
      format: "odt",
      extension: "odt",
      mime: "application/vnd.oasis.opendocument.text",
      from: true,
      to: false,
      internal: "odt"
    },
    {
      name: "OpenDocument Presentation",
      format: "odp",
      extension: "odp",
      mime: "application/vnd.oasis.opendocument.presentation",
      from: true,
      to: false,
      internal: "odp"
    },
    {
      name: "OpenDocument Spreadsheet",
      format: "ods",
      extension: "ods",
      mime: "application/vnd.oasis.opendocument.spreadsheet",
      from: true,
      to: false,
      internal: "ods"
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
    {
      name: "LÖVE Game Package",
      format: "love",
      extension: "love",
      mime: "application/zip",
      from: true,
      to: false,
      internal: "love"
    },
    {
      name: "LÖVE Game Package",
      format: "love",
      extension: "love",
      mime: "application/zip",
      from: true,
      to: false,
      internal: "love"
    },
    {
      name: "osu! Beatmap",
      format: "osz",
      extension: "osz",
      mime: "application/zip",
      from: true,
      to: false,
      internal: "osz"
    },
    {
      name: "osu! Skin",
      format: "osk",
      extension: "osk",
      mime: "application/zip",
      from: true,
      to: false,
      internal: "osk"
    },
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
  ];

  public ready: boolean = true;

  async init () {
    this.ready = true;
  }

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

}

export default renameHandler;
