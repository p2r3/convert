// file: textToSource.ts

import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats from "src/CommonFormats.ts";

function python(text: string): string {
  return `print(${JSON.stringify(text)})`;
}

function javascript(text: string): string {
  return `console.log(${JSON.stringify(text)});`;
}

function c(text: string): string {
  return `#include <stdio.h>\n\nint main() { printf("%s\\n", ${JSON.stringify(text)}); }`;
}

function cpp(text: string): string {
  return `#include <iostream>\n\nint main() { std::cout << ${JSON.stringify(text)} << std::endl; }`;
}

function go(text: string): string {
  text = text.replaceAll("`", "` + \"`\" + `");
  return `package main\n\nimport \"fmt\"\n\nfunc main() {\n\tfmt.Println(\`${text}\`)\n}\n`;
}

function batch(text: string): string {
  text = text
    .replaceAll("^", "^^")
    .replaceAll("%", "%%")
    .replaceAll("&", "^&")
    .replaceAll("|", "^|")
    .replaceAll("<", "^<")
    .replaceAll(">", "^>");
  const lines = text.split(/\r?\n/);
  const echos = lines.map(line => line.trim() === "" ? "echo.\r\n" : `echo ${line}\r\n`);
  return `@echo off\r\n${echos.join("")}pause\r\n`;
}

function shell(text: string): string {
  text = text.replaceAll("'", "'\"'\"'");
  return `#!/bin/sh\nprintf '%s\n' '${text}'`;
}

function csharp(text: string): string {
  // Content of the .txt file will be translated to a C# verbatim string,
  // so quotes must be escaped using the verbatim string escape syntax (two double quotes, "")
  // instead of the usual \" escape.
  text = text.replaceAll("\"", "\"\"");
  return `using System;\n\nConsole.WriteLine(@"${text}");\n\nConsole.Read();\n`;
}

function rust(text: string): string {
  let count = 0;
  while (text.includes(`"${'#'.repeat(count)}`)) { count++; }
  const hashtags = '#'.repeat(count);
  return `fn main() { println!("{}", r${hashtags}"${text}"${hashtags}); }`;
}

class textToSourceHandler implements FormatHandler {

  static converters: [FileFormat, (text: string) => string][] = [
    [CommonFormats.PYTHON.builder("py").allowTo().markLossless(), python],
    [{
      name: "Javascript Source File",
      format: "js",
      extension: "js",
      mime: "text/javascript",
      from: false,
      to: true,
      internal: "js",
      category: "code",
      lossless: true,
    }, javascript],
    [{
      name: "C Source File",
      format: "c",
      extension: "c",
      mime: "text/x-c",
      from: false,
      to: true,
      internal: "c",
      category: "code",
      lossless: true,
    }, c],
    [{
      name: "C++ Source File",
      format: "cpp",
      extension: "cpp",
      mime: "text/x-c++src",
      from: false,
      to: true,
      internal: "cpp",
      category: "code",
      lossless: true,
    }, cpp],
    [{
      name: "Go Source File",
      format: "go",
      extension: "go",
      mime: "text/x-go",
      from: false,
      to: true,
      internal: "go",
      category: "code",
      lossless: true,
    }, go],
    [CommonFormats.BATCH.builder("bat").allowTo().markLossless(), batch],
    [CommonFormats.SH.builder("sh").allowTo().markLossless(), shell],
    [{
      name: "C# Source File",
      format: "cs",
      extension: "cs",
      mime: "text/csharp",
      from: false,
      to: true,
      internal: "csharp",
      category: "code",
      lossless: true,
    }, csharp],
    [{
      name: "Rust Source File",
      format: "rs",
      extension: "rs",
      mime: "text/rust",
      from: false,
      to: true,
      internal: "rs",
      category: "code",
      lossless: true,
    }, rust],
  ];

  public name: string = "textToSource";
  public supportedFormats?: FileFormat[];
  public ready: boolean = false;

  async init () {
    const formats = textToSourceHandler.converters.map(([format]) => format);
    this.supportedFormats = [
      CommonFormats.TEXT.builder("txt").allowFrom().markLossless(),
    ];
    this.supportedFormats.push(...formats);

    this.ready = true;
  }

  async doConvert (
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];
    const converterEntry = textToSourceHandler.converters.find(
      ([format]) => format.internal === outputFormat.internal
    );

    if (!converterEntry) {
      throw new Error(`could not find a textToSource converter to convert to ${outputFormat.mime}`);
    }

    const [, converter] = converterEntry;

    for (const inputFile of inputFiles) {
      const text = new TextDecoder().decode(inputFile.bytes).replaceAll(/\r?\n/g, "\n");

      const converted = converter(text);

      const bytes = new TextEncoder().encode(converted);
      const name = inputFile.name.replace(/\.txt$/i, `.${outputFormat.extension}`);
      outputFiles.push({ bytes, name });
    }
    return outputFiles;
  }

}

export default textToSourceHandler;
