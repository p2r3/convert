import Formats from "src/Formats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import type { HandlerName } from "./index.ts";
import { encode } from "src/common/index.ts";

/**
 * Drops the whitespace between JSON tokens. Everything else is kept as written, which
 * `JSON.stringify(JSON.parse(text))` would not do: it rounds large numbers and merges duplicate keys.
 */
export function minifyJson(text: string): string {
  JSON.parse(text); // only here to reject invalid input
  return text.replace(/("(?:[^"\\]|\\.)*")|\s+/g, "$1");
}

/**
 * Makes a handler that turns one format into a smaller file of the same format.
 * A single format means no edges in the conversion graph, so these only run when the
 * input and output formats are the same (see `compressorsFor`).
 */
function createMinifyHandler(
  name: HandlerName,
  format: FileFormat,
  minify: (code: string) => string | Promise<string>,
) {
  return class implements FormatHandler {
    public readonly name = name;
    public supportedFormats = [format];
    public ready = false;

    async init() {
      this.ready = true;
    }

    async doConvert(inputFiles: FileData[]): Promise<FileData[]> {
      // a file in another encoding would come out corrupted, so refuse it instead
      const decoder = new TextDecoder("utf-8", { fatal: true });
      const outputFiles: FileData[] = [];
      for (const file of inputFiles) {
        const code = await minify(decoder.decode(file.bytes));
        outputFiles.push({ name: file.name, bytes: encode(code) });
      }
      return outputFiles;
    }
  };
}

export const minifySvgHandler = createMinifyHandler(
  "minifySvg",
  Formats.SVG.builder("svg").fromTo(),
  async (code) => (await import("svgo/browser")).optimize(code, { multipass: true }).data,
);

export const minifyHtmlHandler = createMinifyHandler(
  "minifyHtml",
  Formats.HTML.builder("html").fromTo(),
  async (code) => {
    // the package's default entry needs Node's fs, this bundle doesn't
    // @ts-ignore
    const { minify } = await import("html-minifier-terser/dist/htmlminifier.esm.bundle");
    return minify(code, {
      collapseWhitespace: true,
      // keeps one space wherever there was whitespace, so inline text never runs together
      conservativeCollapse: true,
      removeComments: true,
      minifyCSS: true,
      minifyJS: true,
    });
  },
);

export const minifyCssHandler = createMinifyHandler(
  "minifyCss",
  Formats.CSS.builder("css").fromTo(),
  async (code) =>
    (await import("sass")).compileString(code, { syntax: "css", style: "compressed" }).css,
);

export const minifyJsHandler = createMinifyHandler(
  "minifyJs",
  Formats.JS.builder("js").fromTo(),
  async (code) => {
    const { code: minified } = await (await import("terser")).minify(code);
    if (minified === undefined) throw new Error("terser produced no output");
    return minified;
  },
);

export const minifyJsonHandler = createMinifyHandler(
  "minifyJson",
  Formats.JSON.builder("json").fromTo(),
  minifyJson,
);
