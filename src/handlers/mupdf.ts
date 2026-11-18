import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import Formats from "src/Formats.ts";
import { DocumentWriter, Document, Buffer, Matrix } from "mupdf";
import { changeExt } from "src/common/index.ts";
import type { ConvertContext } from "src/ui/ProgressStore.ts";

const SIZE = { width: true, height: true } as const;

class mupdfHandler implements FormatHandler {
  public readonly name = "mupdf";
  // theres 0 ways to query it, so we have this big ass list
  public supportedFormats = [
    Formats.PDF.builder("pdf").fromTo(),
    Formats.EPUB.builder("epub").from(),
    Formats.MOBI.builder("mobi").from(),
    Formats.FB2.builder("fb2").from(),
    Formats.DOCX.builder("docx").from(),
    Formats.XLSX.builder("xlsx").from(),
    Formats.PPTX.builder("pptx").from(),
    Formats.HWPX.builder("hwpx").from(),
    Formats.MD.builder("md").from(),
    Formats.CBZ.builder("cbz").fromTo(),
    Formats.CBT.builder("cbt").from(),
    // most images should go through imagemagick but it doesnt have some
    Formats.JXR.builder("jxr").from(),
    Formats.JBIG2.builder("jbig2").from(),
    Formats.PNG.builder("png").options(SIZE).to(),
    Formats.JPEG.builder("jpeg").options(SIZE).to(),
    Formats.PNM.builder("pnm").options(SIZE).to(),
    Formats.PGM.builder("pgm").options(SIZE).to(),
    Formats.PPM.builder("ppm").options(SIZE).to(),
    Formats.PAM.builder("pam").options(SIZE).to(),
    Formats.PBM.builder("pbm").options(SIZE).to(),
    Formats.PKM.builder("pkm").options(SIZE).fromTo(),
    Formats.PCL.builder("pcl").to(),
    Formats.PCLM.builder("pclm").fromTo(),
    Formats.PS.builder("ps").to(),
    Formats.PWG.builder("pwg").to(),
    Formats.SVG.builder("svg").lossless().to(),
    Formats.HTML.builder("html").lossless().from(),
    // html has *more* issues than svg with text positioning, better embed svg
    Formats.XHTML.builder("xhtml").fromTo(),
    Formats.TEXT.builder("text").fromTo(),
  ];
  public ready = false;

  async init() {
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
    ctx?: ConvertContext,
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];
    const { width, height } = ctx?.options ?? {};

    for (const inputFile of inputFiles) {
      const document = Document.openDocument(inputFile.bytes, inputFormat.mime);

      // oxfmt-ignore
      const multipage = ["pdf", "html", "xhtml", "text", "cbz", "ps", "pcl", "pclm", "pwg"]
        .includes(outputFormat.internal);
      let options = "";
      if (outputFormat.internal === "svg") options = "text=text";
      if (outputFormat.internal === "html")
        options = "preserve-whitespace,preserve-spans,preserve-images";
      // the raster writers fit the page into these, keeping the aspect ratio if one is missing
      if (!multipage && outputFormat.internal !== "svg")
        options = [width && `width=${width}`, height && `height=${height}`]
          .filter(Boolean)
          .join(",");

      if (multipage) {
        const buffer = new Buffer();
        const writer = new DocumentWriter(buffer, outputFormat.internal, options);
        for (let i = 0; i < document.countPages(); i++) {
          const page = document.loadPage(i);
          const dev = writer.beginPage(page.getBounds());
          page.run(dev, Matrix.identity);
          writer.endPage();
          page.destroy();
        }
        writer.close();
        outputFiles.push({
          name: changeExt(inputFile.name, outputFormat.extension),
          bytes: new Uint8Array(buffer.asUint8Array()),
        });
        writer.destroy();
        buffer.destroy();
      } else {
        for (let i = 0; i < document.countPages(); i++) {
          const buffer = new Buffer();
          const writer = new DocumentWriter(buffer, outputFormat.internal, options);
          const page = document.loadPage(i);
          const dev = writer.beginPage(page.getBounds());
          page.run(dev, Matrix.identity);
          writer.endPage();
          page.destroy();
          writer.close();
          outputFiles.push({
            name: changeExt(inputFile.name, outputFormat.extension, `_${i}`),
            bytes: new Uint8Array(buffer.asUint8Array()),
          });
          writer.destroy();
          buffer.destroy();
        }
      }

      document.destroy();
    }

    return outputFiles;
  }
}

export default mupdfHandler;
