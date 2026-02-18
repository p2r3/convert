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
    ["plain", "plain text"],
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
    ["zimwiki", "ZimWiki markup"]
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
    ["plain", "txt"],
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
    ["vimdoc", "txt"]
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

    const allFormats = new Set(inputFormats);
    outputFormats.forEach(format => allFormats.add(format));

    this.supportedFormats = [];
    for (const format of allFormats) {
      const name = pandocHandler.formatNames.get(format) || format;
      const extension = pandocHandler.formatExtensions.get(format) || format;
      this.supportedFormats.push({
        name, format, extension,
        mime: normalizeMimeType(mime.getType(extension) || `text/${format}`),
        from: inputFormats.includes(format),
        to: outputFormats.includes(format),
        internal: format,
        category: "document",
        lossless: true // Unsure about this, it might be lossy, i don't know enough about pandoc to say for sure
      });
    }

    console.log(this.supportedFormats);

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

      const { stderr } = await this.convert({
        from: inputFormat.internal,
        to: outputFormat.internal,
        "input-files": [inputFile.name],
        "output-file": "output"
      }, null, files);

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