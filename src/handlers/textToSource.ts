import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import Formats from "src/Formats.ts";
import { changeExt, decode, encode } from "src/common/index.ts";

function python(text: string): string {
  return `print(${JSON.stringify(text)})`;
}

function javascript(text: string): string {
  return `console.log(${JSON.stringify(text)});`;
}

/** C string literal with octal escapes for control characters. */
function cString(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (ch === "\\" || ch === '"' || ch === "?") out += `\\${ch}`;
    else if (ch === "\n") out += "\\n";
    else if (ch === "\t") out += "\\t";
    else if (code < 0x20 || code === 0x7f) out += `\\${code.toString(8).padStart(3, "0")}`;
    else out += ch;
  }
  return `"${out}"`;
}

function c(text: string): string {
  return `#include <stdio.h>\n\nint main() { printf("%s\\n", ${cString(text)}); }`;
}

function cpp(text: string): string {
  return `#include <iostream>\n\nint main() { std::cout << ${JSON.stringify(text)} << std::endl; }`;
}

function go(text: string): string {
  return `package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println(${JSON.stringify(text)})\n}\n`;
}

function batch(text: string): string {
  text = text.replaceAll("%", "%%").replaceAll(/[\^&|<>"]/g, "^$&");
  const lines = text.split(/\r?\n/);
  const echos = lines.map((line) => `echo(${line}\r\n`);
  return `@echo off\r\nchcp 65001 >nul\r\n${echos.join("")}pause\r\n`;
}

function shell(text: string): string {
  text = text.replaceAll("'", "'\"'\"'");
  return `#!/bin/sh\nprintf '%s\n' '${text}'`;
}

function csharp(text: string): string {
  // Content of the .txt file will be translated to a C# verbatim string,
  // so quotes must be escaped using the verbatim string escape syntax (two double quotes, "")
  // instead of the usual \" escape.
  text = text.replaceAll('"', '""');
  return `using System;\n\nConsole.WriteLine(@"${text}");\n\nConsole.Read();\n`;
}

function rust(text: string): string {
  const escaped = Array.from(text, (ch) => {
    const code = ch.codePointAt(0)!;
    if (ch === "\\" || ch === '"') return `\\${ch}`;
    if (ch === "\n") return "\\n";
    if (ch === "\r") return "\\r";
    if (ch === "\t") return "\\t";
    if (code < 0x20 || code === 0x7f) return `\\u{${code.toString(16)}}`;
    return ch;
  }).join("");
  return `fn main() { println!("{}", "${escaped}"); }`;
}

class textToSourceHandler implements FormatHandler {
  static converters: [FileFormat, (text: string) => string][] = [
    [Formats.PYTHON.builder("py").lossless().to(), python],
    [Formats.JS.builder("js").lossless().to(), javascript],
    [Formats.C.builder("c").lossless().to(), c],
    [Formats.CPP.builder("cpp").lossless().to(), cpp],
    [Formats.GO.builder("go").lossless().to(), go],
    [Formats.BATCH.builder("bat").lossless().to(), batch],
    [Formats.SH.builder("sh").lossless().to(), shell],
    [Formats.CSHARP.builder("csharp").lossless().to(), csharp],
    [Formats.RUST.builder("rs").lossless().to(), rust],
  ];

  public readonly name = "textToSource";
  public supportedFormats = [
    Formats.TEXT.builder("txt").lossless().from(),
    ...textToSourceHandler.converters.map(([format]) => format),
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
    const converterEntry = textToSourceHandler.converters.find(
      ([format]) => format.internal === outputFormat.internal,
    );

    if (!converterEntry) {
      throw new Error(`could not find a textToSource converter to convert to ${outputFormat.mime}`);
    }

    const [, converter] = converterEntry;

    for (const inputFile of inputFiles) {
      const text = decode(inputFile.bytes).replaceAll(/\r?\n/g, "\n");

      const converted = converter(text);

      const bytes = encode(converted);
      const name = changeExt(inputFile.name, outputFormat.extension);
      outputFiles.push({ bytes, name });
    }
    return outputFiles;
  }
}

export default textToSourceHandler;
