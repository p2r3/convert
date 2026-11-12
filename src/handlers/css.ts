import { type FileData, type FileFormat, type FormatHandler } from "../FormatHandler.ts";
import Formats from "src/Formats.ts";
import { changeExt, decode, encode } from "src/common/index.ts";

// refuse to load any plugins for security
class NoPluginLoader {
  loadPlugin() {
    return Promise.reject(new Error("LESS plugins are not supported"));
  }
  loadPluginSync(): never {
    throw new Error("LESS plugins are not supported");
  }
}

class cssHandler implements FormatHandler {
  public readonly name = "css";
  public supportedFormats = [
    Formats.CSS.builder("css").lossless().fromTo(),
    Formats.LESS.builder("less").from(),
    Formats.SCSS.builder("scss").from(),
  ];
  public ready = false;

  async init() {
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];
    for (const file of inputFiles) {
      const source = decode(file.bytes);
      let css: string;
      if (inputFormat.internal === "less") {
        // @ts-ignore
        const { default: createLess } = await import("less/lib/less/index.js");
        const less = createLess();
        less.PluginLoader = NoPluginLoader;
        const { css: compiled } = await less.render(source, { disablePluginRule: true });
        css = compiled;
      } else if (inputFormat.internal === "scss") {
        const sass = await import("sass");
        const result = sass.compileString(source, { url: new URL(`file://${file.name}`) });
        css = result.css;
      } else {
        css = source;
      }

      outputFiles.push({
        name: changeExt(file.name, outputFormat.internal),
        bytes: encode(css),
      });
    }
    return outputFiles;
  }
}

export default cssHandler;
