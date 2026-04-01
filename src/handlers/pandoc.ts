import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import type { ConvertContext } from "../ui/ProgressStore.js";
import CommonFormats from "src/CommonFormats.ts";
import mime from "mime";
import normalizeMimeType from "../normalizeMimeType.ts";

export const TYPST_PAGEBREAK_MARKER = "CONVERTTYPSTPAGEBREAKTOKEN";
export const TYPST_ASSET_MANIFEST_START = "// convert-assets-start";
export const TYPST_ASSET_MANIFEST_END = "// convert-assets-end";

export function normalizeTypstAssetPaths(
  typstContent: string,
  shadowFiles: Record<string, Uint8Array>,
): string {
  const availablePaths = new Map<string, string>();

  for (const path of Object.keys(shadowFiles)) {
    const normalized = path
      .replace(/\\/gu, "/")
      .replace(/^\/+/u, "")
      .replace(/^\.\/+/u, "")
      .replace(/^(?:\.\.\/)+/u, "");
    availablePaths.set(normalized, path);
  }

  return typstContent.replace(/(['"])([^"'\\\n]+)\1/gu, (match, quote, candidatePath) => {
    const normalized = candidatePath
      .replace(/\\/gu, "/")
      .replace(/^\/+/u, "")
      .replace(/^\.\/+/u, "")
      .replace(/^(?:\.\.\/)+/u, "");
    const canonicalPath = availablePaths.get(normalized);
    if (!canonicalPath) return match;
    return `${quote}${canonicalPath}${quote}`;
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function parseStyleAttribute(style: string): Map<string, string> {
  const entries = new Map<string, string>();

  for (const declaration of style.split(";")) {
    const separatorIndex = declaration.indexOf(":");
    if (separatorIndex === -1) continue;

    const property = declaration.slice(0, separatorIndex).trim().toLowerCase();
    const value = declaration.slice(separatorIndex + 1).trim();
    if (!property || !value) continue;

    entries.set(property, value);
  }

  return entries;
}

function hasPageBreakValue(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "page" || normalized === "always";
}

function elementHasMeaningfulContent(element: Element): boolean {
  if (element.children.length > 0) return true;
  if ((element.textContent || "").trim().length > 0) return true;

  return [
    "img",
    "svg",
    "table",
    "hr",
    "video",
    "audio",
    "canvas",
    "iframe",
  ].includes(element.tagName.toLowerCase());
}

function shouldInsertPageBreakBefore(element: Element): boolean {
  const classList = element.classList;
  if (classList.contains("__page") || classList.contains("epub-section")) return true;

  const styles = parseStyleAttribute(element.getAttribute("style") || "");
  return hasPageBreakValue(styles.get("break-before"))
    || hasPageBreakValue(styles.get("page-break-before"));
}

function shouldInsertPageBreakAfter(element: Element): boolean {
  const styles = parseStyleAttribute(element.getAttribute("style") || "");
  return hasPageBreakValue(styles.get("break-after"))
    || hasPageBreakValue(styles.get("page-break-after"));
}

function createPageBreakMarker(document: Document): HTMLParagraphElement {
  const marker = document.createElement("p");
  marker.setAttribute("data-typst-pagebreak-marker", "true");
  marker.textContent = TYPST_PAGEBREAK_MARKER;
  return marker;
}

function appendTypstAttribute(
  element: Element,
  name: string,
  value: string | undefined,
) {
  if (!value || element.hasAttribute(name)) return;
  element.setAttribute(name, value);
}

function promoteImageDimensions(element: Element, styles: Map<string, string>) {
  if (element.tagName.toLowerCase() !== "img") return;

  const width = styles.get("width") || styles.get("max-width");
  const height = styles.get("height") || styles.get("max-height");

  if (width && !element.getAttribute("width")) {
    element.setAttribute("width", width);
  }
  if (height && !element.getAttribute("height")) {
    element.setAttribute("height", height);
  }
}

function applyTypstStyleHints(element: Element) {
  const style = element.getAttribute("style");
  if (!style) return;

  const styles = parseStyleAttribute(style);
  if (styles.size === 0) return;

  const tagName = element.tagName.toLowerCase();
  const inlineTextContainer = [
    "span",
    "a",
    "code",
    "kbd",
    "mark",
    "small",
    "sub",
    "sup",
  ].includes(tagName);
  const blockContainer = [
    "div",
    "p",
    "section",
    "article",
    "blockquote",
    "pre",
    "figure",
    "table",
    "td",
    "th",
  ].includes(tagName);

  if (inlineTextContainer) {
    appendTypstAttribute(element, "typst:text:fill", styles.get("color"));
    appendTypstAttribute(element, "typst:text:size", styles.get("font-size"));
    appendTypstAttribute(element, "typst:text:font", styles.get("font-family"));
  }

  if (blockContainer) {
    appendTypstAttribute(
      element,
      "typst:fill",
      styles.get("background") || styles.get("background-color"),
    );
    appendTypstAttribute(
      element,
      "typst:inset",
      styles.get("padding"),
    );
    appendTypstAttribute(
      element,
      "typst:stroke",
      styles.get("border"),
    );

    if (
      styles.get("break-inside")?.toLowerCase() === "avoid"
      || styles.get("page-break-inside")?.toLowerCase() === "avoid"
    ) {
      appendTypstAttribute(element, "typst:breakable", "false");
    }
  }

  promoteImageDimensions(element, styles);
}

export function preprocessHtmlForTypst(htmlContent: string): string {
  if (typeof DOMParser === "undefined") return htmlContent;

  const document = new DOMParser().parseFromString(htmlContent, "text/html");
  const elements = Array.from(document.body.querySelectorAll("*"));
  let sawMeaningfulContent = false;

  for (const element of elements) {
    if (
      shouldInsertPageBreakBefore(element)
      && sawMeaningfulContent
      && element.previousElementSibling?.getAttribute("data-typst-pagebreak-marker") !== "true"
    ) {
      element.before(createPageBreakMarker(document));
    }

    applyTypstStyleHints(element);

    if (elementHasMeaningfulContent(element)) {
      sawMeaningfulContent = true;
    }

    if (
      shouldInsertPageBreakAfter(element)
      && element.nextElementSibling?.getAttribute("data-typst-pagebreak-marker") !== "true"
    ) {
      element.after(createPageBreakMarker(document));
    }
  }

  return "<!DOCTYPE html>\n" + document.documentElement.outerHTML;
}

export function postprocessTypstFromPandoc(typstContent: string): string {
  const escaped = escapeRegExp(TYPST_PAGEBREAK_MARKER);

  return typstContent.replace(
    new RegExp(`^.*${escaped}.*$`, "gmu"),
    "#colbreak(weak: true)",
  );
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

async function collectTypstAssetFiles(
  files: Record<string, any>,
  excludedPaths: string[] = [],
): Promise<Record<string, Uint8Array>> {
  const bundledAssets: Record<string, Uint8Array> = {};
  const excluded = new Set([
    "stdin",
    "stdout",
    "stderr",
    "warnings",
    "output",
    ...excludedPaths,
  ]);

  for (const [path, file] of Object.entries(files)) {
    if (excluded.has(path)) continue;
    if (!(file instanceof Blob)) continue;

    const arrayBuffer = await file.arrayBuffer();
    bundledAssets[path] = new Uint8Array(arrayBuffer);
  }

  return bundledAssets;
}

export async function bundleTypstAssets(
  typstContent: string,
  files: Record<string, any>,
  excludedPaths: string[] = [],
): Promise<string> {
  const shadowFiles = await collectTypstAssetFiles(files, excludedPaths);
  const assetPaths = Object.keys(shadowFiles);

  if (assetPaths.length === 0) return typstContent;
  const bundledAssets = Object.fromEntries(
    Object.entries(shadowFiles).map(([path, bytes]) => [path, bytesToBase64(bytes)]),
  );

  return [
    TYPST_ASSET_MANIFEST_START,
    `// ${JSON.stringify(bundledAssets)}`,
    TYPST_ASSET_MANIFEST_END,
    "",
    typstContent,
  ].join("\n");
}

class pandocHandler implements FormatHandler {

  static formatNames: Map<string, string> = new Map([
    ["ansi", "ANSI terminal"],
    ["asciidoc", "modern AsciiDoc"],
    ["asciidoc_legacy", "AsciiDoc for asciidoc-py"],
    ["asciidoctor", "AsciiDoctor (= modern AsciiDoc)"],
    ["bbcode", "BBCode"],
    ["beamer", "LaTeX Beamer slides"],
    ["biblatex", "BibLaTeX bibliography"],
    ["bibtex", "BibTeX bibliography"],
    ["bits", "BITS XML, alias for jats"],
    ["chunkedhtml", "zip of linked HTML files"],
    ["commonmark", "CommonMark Markdown"],
    ["commonmark_x", "CommonMark with extensions"],
    ["context", "ConTeXt"],
    ["creole", "Creole 1.0"],
    ["csljson", "CSL JSON bibliography"],
    ["csv", CommonFormats.CSV.name],
    ["djot", "Djot markup"],
    ["docbook", "DocBook v4"],
    ["docbook5", "DocBook v5"],
    ["docx", CommonFormats.DOCX.name],
    ["dokuwiki", "DokuWiki markup"],
    ["dzslides", "DZSlides HTML slides"],
    ["endnotexml", "EndNote XML bibliography"],
    ["epub", "EPUB v3"],
    ["epub2", "EPUB v2"],
    ["epub3", "EPUB v3"],
    ["fb2", "FictionBook2"],
    ["gfm", "GitHub-Flavored Markdown"],
    ["haddock", "Haddock markup"],
    ["html", CommonFormats.HTML.name],
    ["html4", "XHTML 1.0 Transitional"],
    ["html5", CommonFormats.HTML.name],
    ["icml", "InDesign ICML"],
    ["ipynb", "Jupyter notebook"],
    ["jats", "JATS XML"],
    ["jira", "Jira/Confluence wiki markup"],
    ["json", CommonFormats.JSON.name],
    ["latex", "LaTeX"],
    ["man", "roff man"],
    ["markdown", "Pandoc's Markdown"],
    ["markdown_mmd", "MultiMarkdown"],
    ["markdown_phpextra", "PHP Markdown Extra"],
    ["markdown_strict", "original unextended Markdown"],
    ["markdown_github", "GitHub-Flavored Markdown"],
    ["markua", "Markua"],
    ["mdoc", "mdoc manual page markup"],
    ["mediawiki", "MediaWiki markup"],
    ["ms", "roff ms"],
    ["muse", "Muse"],
    ["native", "native Haskell"],
    ["odt", "OpenDocument Text"],
    ["opendocument", "OpenDocument XML"],
    ["opml", "OPML"],
    ["org", "Emacs Org mode"],
    ["pdf", CommonFormats.PDF.name],
    ["text", CommonFormats.TEXT.name],
    ["pod", "Perl POD"],
    ["pptx", CommonFormats.PPTX.name],
    ["revealjs", "reveal.js HTML slides"],
    ["ris", "RIS bibliography"],
    ["rst", "reStructuredText"],
    ["rtf", "Rich Text Format"],
    ["s5", "S5 HTML slides"],
    ["slideous", "Slideous HTML slides"],
    ["slidy", "Slidy HTML slides"],
    ["t2t", "txt2tags"],
    ["tei", "TEI Simple"],
    ["texinfo", "GNU Texinfo"],
    ["textile", "Textile"],
    ["tikiwiki", "TikiWiki markup"],
    ["tsv", "TSV table"],
    ["twiki", "TWiki markup"],
    ["typst", "Typst"],
    ["vimdoc", "Vimdoc"],
    ["vimwiki", "Vimwiki"],
    ["xlsx", CommonFormats.XLSX.name],
    ["xml", CommonFormats.XML.name],
    ["xwiki", "XWiki markup"],
    ["zimwiki", "ZimWiki markup"],
    ["mathml", "Mathematical Markup Language"],
  ]);

  static formatExtensions: Map<string, string> = new Map([
    ["html", "html"],
    ["html5", "html"],
    ["html4", "html"],
    ["chunkedhtml", "zip"],
    ["markdown", "md"],
    ["markdown_strict", "md"],
    ["markdown_mmd", "md"],
    ["markdown_phpextra", "md"],
    ["markdown_github", "md"],
    ["gfm", "md"],
    ["commonmark", "md"],
    ["commonmark_x", "md"],
    ["latex", "tex"],
    ["beamer", "tex"],
    ["context", "tex"],
    ["pdf", "pdf"],
    ["docx", "docx"],
    ["odt", "odt"],
    ["epub", "epub"],
    ["epub2", "epub"],
    ["epub3", "epub"],
    ["rst", "rst"],
    ["org", "org"],
    ["text", "txt"],
    ["json", "json"],
    ["native", "native"],
    ["docbook", "xml"],
    ["docbook4", "xml"],
    ["docbook5", "xml"],
    ["jats", "xml"],
    ["tei", "xml"],
    ["man", "1"],
    ["rtf", "rtf"],
    ["textile", "textile"],
    ["mediawiki", "wiki"],
    ["asciidoc", "adoc"],
    ["asciidoctor", "adoc"],
    ["asciidoc_legacy", "adoc"],
    ["revealjs", "html"],
    ["slidy", "html"],
    ["slideous", "html"],
    ["dzslides", "html"],
    ["s5", "html"],
    ["ipynb", "ipynb"],
    ["typst", "typ"],
    ["texinfo", "texi"],
    ["ms", "ms"],
    ["icml", "icml"],
    ["opml", "opml"],
    ["bibtex", "bib"],
    ["biblatex", "bib"],
    ["csljson", "json"],
    ["pptx", "pptx"],
    ["djot", "dj"],
    ["fb2", "fb2"],
    ["opendocument", "xml"],
    ["vimdoc", "txt"],
    ["mathml", "mml"],
  ]);

  public name: string = "pandoc";
  public supportedFormats?: FileFormat[];
  public ready: boolean = false;

  private query?: (options: any) => Promise<any>;
  private convert?: (options: any, stdin: any, files: any) => Promise<{
    stdout: string;
    stderr: string;
    warnings: any;
  }>;

  async init () {
    const { query, convert } = await import("./pandoc/pandoc.js");
    this.query = query;
    this.convert = convert;

    const inputFormats: string[] = await query({ query: "input-formats" });
    const outputFormats: string[] = await query({ query: "output-formats" });

    outputFormats.push("mathml");

    const allFormats = new Set(inputFormats);
    outputFormats.forEach(format => allFormats.add(format));

    this.supportedFormats = [];
    for (const internal of allFormats) {
      let format = internal;
      if (format === "revealjs") continue;
      if (format === "pdf") continue;
      if (format === "plain") format = "text";
      const name = pandocHandler.formatNames.get(format) || format;
      const extension = pandocHandler.formatExtensions.get(format) || format;
      const mimeType = normalizeMimeType(mime.getType(extension) || `text/${format}`);
      const categories: string[] = [];
      if (format === "xlsx") categories.push("spreadsheet");
      else if (format === "pptx") categories.push("presentation");
      if (
        name.toLowerCase().includes("text")
        || mimeType === "text/plain"
      ) {
        categories.push("text");
      } else {
        categories.push("document");
      }
      const isOfficeDocument = format === "docx"
        || format === "xlsx"
        || format === "pptx"
        || format === "odt"
        || format === "ods"
        || format === "odp";
      const isTypst = format === "typst";
      const isEpubInput = format === "epub"
        || format === "epub2"
        || format === "epub3";
      this.supportedFormats.push({
        name, format, extension,
        mime: mimeType,
        from: inputFormats.includes(internal) && !isEpubInput,
        to: outputFormats.includes(internal),
        internal,
        category: categories.length === 1 ? categories[0] : categories,
        lossless: !isOfficeDocument && !isTypst
      });
    }

    const htmlIndex = this.supportedFormats.findIndex(c => c.internal === "html");
    const htmlFormat = this.supportedFormats[htmlIndex];
    this.supportedFormats.splice(htmlIndex, 1);
    this.supportedFormats.unshift(htmlFormat);
    const typstIndex = this.supportedFormats.findIndex(c => c.internal === "typst");
    if (typstIndex !== -1) {
      const typstFormat = this.supportedFormats[typstIndex];
      this.supportedFormats.splice(typstIndex, 1);
      this.supportedFormats.splice(1, 0, typstFormat);
    }
    const jsonXmlFormats = this.supportedFormats.filter(c =>
      c.mime === "application/json"
      || c.mime === "application/xml"
    );
    this.supportedFormats = this.supportedFormats.filter(c =>
      c.mime !== "application/json"
      && c.mime !== "application/xml"
    );
    this.supportedFormats.push(...jsonXmlFormats);

    this.ready = true;
  }

  async doConvert (
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
    args?: string[],
    ctx?: ConvertContext
  ): Promise<FileData[]> {
    if (
      !this.ready
      || !this.query
      || !this.convert
    ) throw "Handler not initialized.";

    const outputFiles: FileData[] = [];

    ctx?.log(`Initialising Pandoc for ${inputFormat.name} -> ${outputFormat.name}...`);

    let i = 0;
    for (const inputFile of inputFiles) {
      const progressMsg = `Converting ${inputFile.name}...`;
      ctx?.progress(progressMsg, i / inputFiles.length);
      ctx?.log(progressMsg);

      const vfsInputName = inputFile.name.replace(/^.*[/\\]/, "") || "input.bin";
      const shouldNormalizeHtmlForTypst = inputFormat.internal === "html"
        && (outputFormat.internal === "pdf" || outputFormat.internal === "typst");
      const sourceBytes = shouldNormalizeHtmlForTypst
        ? new TextEncoder().encode(
          preprocessHtmlForTypst(new TextDecoder().decode(inputFile.bytes)),
        )
        : inputFile.bytes;
      const files: Record<string, any> = {
        [vfsInputName]: new Blob([sourceBytes as BlobPart])
      };

      const options: Record<string, any> = {
        from: inputFormat.internal,
        to: outputFormat.internal,
        "input-files": [vfsInputName],
        "output-file": "output",
        "embed-resources": true,
        "html-math-method": "mathjax",
      };

      if (outputFormat.internal === "mathml") {
        options.to = "html";
        options["html-math-method"] = "mathml";
      }

      if (outputFormat.internal === "typst") {
        options.standalone = true;
        options["extract-media"] = "media";
      }

      const { stderr, warnings } = await this.convert(options, null, files);

      if (stderr) {
        ctx?.log(`Pandoc Error: ${stderr}`, "error");
        throw stderr;
      }

      if (warnings && warnings.length > 0) {
        for (const warning of warnings) {
          ctx?.log(`Pandoc Warning: ${JSON.stringify(warning)}`, "warn");
        }
      }

      const outputBlob = files.output;
      if (!(outputBlob instanceof Blob)) {
        ctx?.log(`Pandoc failed to produce output for ${inputFile.name}`, "error");
        continue;
      }

      const arrayBuffer = await outputBlob.arrayBuffer();
      let bytes = new Uint8Array(arrayBuffer);
      if (outputFormat.internal === "typst") {
        const normalizedTypst = normalizeTypstAssetPaths(
          postprocessTypstFromPandoc(new TextDecoder().decode(bytes)),
          await collectTypstAssetFiles(files, [vfsInputName]),
        );
        const bundledTypst = await bundleTypstAssets(
          normalizedTypst,
          files,
          [vfsInputName],
        );
        bytes = new TextEncoder().encode(bundledTypst);
      }
      const name = inputFile.name.split(".").slice(0, -1).join(".") + "." + outputFormat.extension;

      outputFiles.push({ bytes, name });
      i++;
    }

    ctx?.progress("Conversion complete!", 1);
    ctx?.log(`Successfully converted ${outputFiles.length} files.`);

    return outputFiles;
  }

}

export default pandocHandler;
