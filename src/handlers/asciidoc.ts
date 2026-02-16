import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import Asciidoctor from "asciidoctor";

// Polyfill for Node.js environment
if (typeof process !== 'undefined' && process.env && !process.env.hasOwnProperty) {
  process.env.hasOwnProperty = function(prop: string) {
    return Object.prototype.hasOwnProperty.call(this, prop);
  };
}

class asciidocHandler implements FormatHandler {

  public name = "asciidoc";
  public supportedFormats: FileFormat[] = [
    {
      name: "AsciiDoc Document",
      format: "adoc",
      extension: "adoc",
      mime: "text/asciidoc",
      from: true,
      to: false,
      internal: "adoc"
    },
    {
      name: "AsciiDoc Document",
      format: "asciidoc",
      extension: "asciidoc",
      mime: "text/asciidoc",
      from: true,
      to: false,
      internal: "adoc"
    },
    {
      name: "HyperText Markup Language",
      format: "html",
      extension: "html",
      mime: "text/html",
      from: true,
      to: true,
      internal: "html"
    }
  ];
  public ready = false;

  private asciidoctor?: any;

  async init() {
    try {
      this.asciidoctor = Asciidoctor();
      this.ready = true;
    } catch (error) {
      console.error('Failed to initialize AsciiDoc handler:', error);
      this.ready = false;
    }
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];

    if (!this.asciidoctor) {
      throw "Handler not initialized.";
    }

    for (const file of inputFiles) {
      const inputText = new TextDecoder().decode(file.bytes);
      let outputText: string;

      if (inputFormat.internal === "adoc" && outputFormat.internal === "html") {
        outputText = this.asciidoctor.convert(inputText, {
          standalone: true,
          safe: "safe"
        });
      } else {
        throw "Unsupported conversion path.";
      }

      const outputBytes = new TextEncoder().encode(outputText);
      const outputName = file.name.split(".").slice(0, -1).join(".") + "." + outputFormat.extension;

      outputFiles.push({
        name: outputName,
        bytes: new Uint8Array(outputBytes)
      });
    }

    return outputFiles;
  }

}

export default asciidocHandler;
