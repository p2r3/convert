import { FormatDefinition, type FileData, type FileFormat, type FormatHandler } from "../FormatHandler.ts";
import CommonFormats, { Category } from "src/CommonFormats.ts";

const LESS_FORMAT = new FormatDefinition(
  "LESS Stylesheet",
  "less",
  "less",
  "text/less",
  Category.CODE
);

const SCSS_FORMAT = new FormatDefinition(
  "SCSS Stylesheet",
  "scss",
  "scss",
  "text/x-scss",
  Category.CODE
);

class cssHandler implements FormatHandler {
  public name: string = "CSS";
  public supportedFormats?: FileFormat[];
  public ready: boolean = false;

  async init() {
    this.supportedFormats = [
      CommonFormats.CSS.builder("css")
        .allowFrom(true)
        .allowTo(true)
        .markLossless(),
      LESS_FORMAT.builder("less")
        .allowFrom(true),
      SCSS_FORMAT.builder("scss")
        .allowFrom(true)
    ];
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];
    for (const file of inputFiles) {
      const source = new TextDecoder().decode(file.bytes);
      const basename = file.name.split(".").slice(0, -1).join(".");
      let css: string;
      if (inputFormat.internal === "less") {
        const less = await import("less");
        const { css: compiled } = await less.default.render(source);
        css = compiled;
      } else if (inputFormat.internal === "scss") {
        const sass = await import("sass");
        const result = sass.compileString(source, {url: new URL(`file://${file.name}`)})
        css = result.css;
      } else {
        css = source;
      }

      outputFiles.push({
        name: `${basename}.${outputFormat.internal}`,
        bytes: new TextEncoder().encode(css),
      })
    }
    return outputFiles;
  }
}

export default cssHandler;
