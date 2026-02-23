import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

import mime from "mime";
import normalizeMimeType from "../normalizeMimeType.ts";

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
    ["csv", "CSV table"],
    ["djot", "Djot markup"],
    ["docbook", "DocBook v4"],
    ["docbook5", "DocBook v5"],
    ["docx", "Word"],
    ["dokuwiki", "DokuWiki markup"],
    ["dzslides", "DZSlides HTML slides"],
    ["endnotexml", "EndNote XML bibliography"],
    ["epub", "EPUB v3"],
    ["epub2", "EPUB v2"],
    ["epub3", "EPUB v3"],
    ["fb2", "FictionBook2"],
    ["gfm", "GitHub-Flavored Markdown"],
    ["haddock", "Haddock markup"],
    ["html", "HTML"],
    ["html4", "XHTML 1.0 Transitional"],
    ["html5", "HTML"],
    ["icml", "InDesign ICML"],
    ["ipynb", "Jupyter notebook"],
    ["jats", "JATS XML"],
    ["jira", "Jira/Confluence wiki markup"],
    ["json", "JSON version of native AST"],
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
    ["odt", "OpenDocument text"],
    ["opendocument", "OpenDocument XML"],
    ["opml", "OPML"],
    ["org", "Emacs Org mode"],
    ["pdf", "PDF via Typst"],
    ["text", "plain text"],
    ["pod", "Perl POD"],
    ["pptx", "PowerPoint"],
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
    ["xlsx", "Excel spreadsheet"],
    ["xml", "XML version of native AST"],
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

    // Pandoc supports MathML natively but doesn't expose as a format
    outputFormats.push("mathml");

    const allFormats = new Set(inputFormats);
    outputFormats.forEach(format => allFormats.add(format));

    this.supportedFormats = [];
    for (let format of allFormats) {
      // PDF doesn't seem to work, at least with this configuration
      if (format === "pdf") continue;
      // RevealJS seems to hang forever?
      if (format === "revealjs") continue;
      // Adjust plaintext format name to match other handlers
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
      this.supportedFormats.push({
        name, format, extension,
        mime: mimeType,
        from: inputFormats.includes(format),
        to: outputFormats.includes(format),
        internal: format,
        category: categories.length === 1 ? categories[0] : categories,
        lossless: !isOfficeDocument
      });
    }

    // Move HTML up, it's the only format that can embed resources
    const htmlIndex = this.supportedFormats.findIndex(c => c.internal === "html");
    const htmlFormat = this.supportedFormats[htmlIndex];
    this.supportedFormats.splice(htmlIndex, 1);
    this.supportedFormats.unshift(htmlFormat);

    this.ready = true;
  }

  async doConvert (
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {
    if (
      !this.ready
      || !this.query
      || !this.convert
    ) throw "Handler not initialized.";

    const outputFiles: FileData[] = [];

    for (const inputFile of inputFiles) {

      const files = {
        [inputFile.name]: new Blob([inputFile.bytes as BlobPart])
      };

      let options = {
        from: inputFormat.internal,
        to: outputFormat.internal,
        "input-files": [inputFile.name],
        "output-file": "output",
        "embed-resources": true,
        "html-math-method": "mathjax",
      }

      // Set flag for outputting mathml
      if (outputFormat.internal === "mathml") {
        options.to = "html";
        options["html-math-method"] = "mathml";
      }

      const { stderr } = await this.convert(options, null, files);

      if (stderr) throw stderr;

      const outputBlob = files.output;
      if (!(outputBlob instanceof Blob)) continue;

      const arrayBuffer = await outputBlob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      const name = inputFile.name.split(".").slice(0, -1).join(".") + "." + outputFormat.extension;

      outputFiles.push({ bytes, name });

    }

    return outputFiles;
  }

}

export default pandocHandler;