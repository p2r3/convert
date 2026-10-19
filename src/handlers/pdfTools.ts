import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import { FormatDefinition } from "../FormatHandler.ts";
import Formats, { Category } from "src/Formats.ts";
import type { ConversionSettings } from "src/ConversionSettings.ts";
import type { ConvertContext } from "src/ui/ProgressStore.ts";
import { Document, Font, Image, PDFDocument } from "mupdf";
import { changeExt } from "src/common/index.ts";

// its own format, so that picking it is a request to split rather than a PDF to PDF no-op
const PDF_PAGES = new FormatDefinition(
  "PDF pages (one file per page)",
  "pdf-pages",
  "pdf",
  "application/pdf",
  Category.DOCUMENT,
);

// its own format, so that picking it is a request to put every image on a page of one PDF
const PDF_FROM_IMAGES = new FormatDefinition(
  "PDF with one image per page",
  "pdf-from-images",
  "pdf",
  "application/pdf",
  Category.DOCUMENT,
);

/**
 * Reads a page selection such as "2-5,8" or "3-1".
 * @returns Zero-based page indexes in the order they were written.
 */
export function parsePageRange(text: string, pageCount: number): number[] {
  const pages: number[] = [];
  for (const part of text.split(",")) {
    const match = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(part);
    if (!match) throw new Error(`"${part.trim()}" is not a page or a range like 2-5.`);
    const first = Number(match[1]);
    const last = Number(match[2] ?? first);
    for (const page of [first, last]) {
      if (page < 1 || page > pageCount) {
        throw new Error(`Page ${page} does not exist: the PDF has ${pageCount} pages.`);
      }
    }
    const step = first <= last ? 1 : -1;
    for (let page = first; page !== last + step; page += step) pages.push(page - 1);
  }
  return pages;
}

function openPdf(file: FileData, password?: string): PDFDocument {
  const doc = Document.openDocument(file.bytes, "application/pdf").asPDF();
  if (!doc) throw new Error(`${file.name} is not a PDF.`);
  if (doc.needsPassword()) {
    if (!password) {
      throw new Error(`${file.name} is password protected. Enter its password in the settings.`);
    }
    if (!doc.authenticatePassword(password)) {
      throw new Error(`The password for ${file.name} is wrong.`);
    }
  }
  return doc;
}

/**
 * Opens a PDF and applies the page selection and the rotation.
 * The document is changed in place, not copied page by page into a new one, which would
 * lose its bookmarks, form fields and metadata.
 */
function openEdited(file: FileData, settings: ConversionSettings): PDFDocument {
  const doc = openPdf(file, settings.password);

  if (settings.pages) doc.rearrangePages(parsePageRange(settings.pages, doc.countPages()));
  if (settings.rotate) {
    for (let i = 0; i < doc.countPages(); i++) {
      const page = doc.findPage(i);
      // a page without its own rotation takes that of the page tree above it
      const current = page.getInheritable("Rotate");
      const degrees = current.isNumber() ? current.asNumber() : 0;
      page.put("Rotate", (degrees + settings.rotate) % 360);
    }
  }
  return doc;
}

/**
 * Re-encodes the plain photos of a PDF as JPEG, where that makes them smaller than they are
 * in the file now.
 *
 * shortcut: skips images with a mask, a decode array, or a colour space other than 8-bit grey
 * or RGB, and never lowers the resolution. Handle those when scans with CMYK or transparent
 * images turn out to be common.
 */
function recompressImages(doc: PDFDocument, quality: number) {
  for (let number = 1; number < doc.countObjects(); number++) {
    // only the reference knows whether the object has a stream; the resolved dictionary says no
    const ref = doc.newIndirect(number);
    if (!ref.isStream() || ref.get("Subtype").toString() !== "/Image") continue;
    if (["SMask", "Mask", "ImageMask", "Decode"].some((key) => !ref.get(key).isNull())) continue;

    const image = doc.loadImage(ref);
    const space = image.getColorSpace();
    if (image.getBitsPerComponent() !== 8 || !space || !(space.isGray() || space.isRGB())) continue;

    const pixmap = image.toPixmap();
    const jpeg = pixmap.asJPEG(quality);
    pixmap.destroy();
    if (jpeg.length >= ref.readRawStream().getLength()) continue;

    // the colour space entry stays: the JPEG has the same channels, and it may name a profile
    ref.writeRawStream(jpeg);
    ref.put("Filter", doc.newName("DCTDecode"));
    ref.delete("DecodeParms");
  }
}

/** Text as a PDF string in the font's Latin encoding. */
function pdfString(text: string) {
  // shortcut: characters outside Latin-1 print as "?". Embed a Unicode font if that matters.
  const latin = text.replace(/[^\x20-\xff]/g, "?").replace(/[\\()]/g, "\\$&");
  return `(${latin})`;
}

/**
 * Prints page numbers and a watermark on every page, over what is there.
 *
 * shortcut: positions use the unrotated page, so on a page with /Rotate the number sits on
 * a side edge. Turn the stamp with the page once rotated scans need numbering.
 */
function stamp(doc: PDFDocument, { pageNumbers, watermark }: ConversionSettings) {
  if (!pageNumbers && !watermark) return;
  const font = doc.addSimpleFont(new Font("Helvetica"));
  const faded = doc.newDictionary();
  faded.put("Type", doc.newName("ExtGState"));
  faded.put("ca", 0.3);
  const count = doc.countPages();

  for (let i = 0; i < count; i++) {
    const page = doc.findPage(i);
    // added to the resources the page already uses, wherever in the page tree they are,
    // because a new dictionary on the page would hide its own fonts and images
    let resources = page.getInheritable("Resources");
    if (resources.isNull()) {
      resources = doc.newDictionary();
      page.put("Resources", resources);
    }
    for (const [kind, name, value] of [
      ["Font", "StampFont", font],
      ["ExtGState", "StampFade", faded],
    ] as const) {
      if (resources.get(kind).isNull()) resources.put(kind, doc.newDictionary());
      resources.get(kind).put(name, value);
    }

    const cropBox = page.getInheritable("CropBox");
    const box = cropBox.isNull() ? page.getInheritable("MediaBox") : cropBox;
    const [ax, ay, bx, by] = [0, 1, 2, 3].map((n) => box.get(n).asNumber());
    const [x0, y0, x1, y1] = [
      Math.min(ax, bx),
      Math.min(ay, by),
      Math.max(ax, bx),
      Math.max(ay, by),
    ];
    const [width, height] = [x1 - x0, y1 - y0];

    let ops = "";
    if (watermark) {
      // Helvetica averages about half an em per character
      const size = Math.min(96, (Math.hypot(width, height) * 0.7) / (0.5 * watermark.length));
      const angle = Math.atan2(height, width);
      const [cos, sin] = [Math.cos(angle), Math.sin(angle)].map((n) => n.toFixed(4));
      const [cx, cy] = [x0 + width / 2, y0 + height / 2];
      ops += `q /StampFade gs 0.5 g BT /StampFont ${size.toFixed(1)} Tf `;
      ops += `${cos} ${sin} -${sin} ${cos} ${cx} ${cy} Tm `;
      ops += `${((-size * 0.5 * watermark.length) / 2).toFixed(1)} ${(-size / 3).toFixed(1)} Td `;
      ops += `${pdfString(watermark)} Tj ET Q\n`;
    }
    if (pageNumbers) {
      const number = String(i + 1);
      // Helvetica's digits are all 0.556 em wide
      const x = x0 + width / 2 - (number.length * 0.556 * 10) / 2;
      ops += `q 0 g BT /StampFont 10 Tf ${x.toFixed(1)} ${y0 + 20} Td (${number}) Tj ET Q\n`;
    }

    // the page's own content goes between q and Q, so that a transformation it leaves behind
    // doesn't move the stamp
    const contents = doc.newArray();
    contents.push(doc.addStream("q\n", {}));
    const old = page.get("Contents");
    if (old.isArray()) old.forEach((part) => contents.push(part));
    else if (!old.isNull()) contents.push(old);
    contents.push(doc.addStream(`Q\n${ops}`, {}));
    page.put("Contents", contents);
  }
}

/** Save options that lock the PDF with `protect`, or unlock it when it was opened with a password. */
function lockOptions({ password, protect }: ConversionSettings) {
  if (protect) return `,encrypt=aes-256,user-password=${protect},owner-password=${protect}`;
  return password ? ",decrypt" : "";
}

// "garbage" drops what is no longer referenced, such as the pages left out and replaced images
const COMPRESSED = "garbage=deduplicate,compress,compress-images,compress-fonts";

function save(doc: PDFDocument, options: string) {
  const bytes = new Uint8Array(doc.saveToBuffer(options).asUint8Array());
  doc.destroy();
  return bytes;
}

/** Makes a PDF smaller, and applies the page selection and rotation from the output settings. */
export class compressPdfHandler implements FormatHandler {
  public readonly name = "compressPdf";
  // a single format means no edges in the conversion graph, so this only runs for PDF to PDF
  // (see `compressorsFor`)
  public supportedFormats = [Formats.PDF.builder("pdf").fromTo()];
  public ready = false;

  async init() {
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    _inputFormat: FileFormat,
    _outputFormat: FileFormat,
    _args?: string[],
    ctx?: ConvertContext,
  ): Promise<FileData[]> {
    const settings = ctx?.settings ?? {};
    return inputFiles.map((file) => {
      ctx?.throwIfAborted();
      let doc = openEdited(file, settings);
      stamp(doc, settings);
      doc.subsetFonts();
      if (settings.quality) {
        // on the saved result, so that a JPEG is compared with the image as losslessly
        // compressed and not with pixels the file happened to store raw.
        // Saved without a password in between, so that it opens again without one.
        const decrypt = settings.password || settings.protect ? ",decrypt" : "";
        doc = openPdf({ name: file.name, bytes: save(doc, COMPRESSED + decrypt) });
        recompressImages(doc, settings.quality);
      }
      return { name: file.name, bytes: save(doc, COMPRESSED + lockOptions(settings)) };
    });
  }
}

/** Writes every page of a PDF, or the selected ones, as a PDF of its own. */
export class splitPdfHandler implements FormatHandler {
  public readonly name = "splitPdf";
  public supportedFormats = [
    Formats.PDF.builder("pdf").from(),
    PDF_PAGES.builder("pdf").lossless().to(),
  ];
  public ready = false;

  async init() {
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    _inputFormat: FileFormat,
    _outputFormat: FileFormat,
    _args?: string[],
    ctx?: ConvertContext,
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];
    for (const file of inputFiles) {
      ctx?.throwIfAborted();
      const { pages, rotate, password } = ctx?.settings ?? {};
      const source = openEdited(file, { rotate, password });
      const count = source.countPages();
      const digits = String(count).length;
      // the selection is applied here and not by `openEdited`, so that each file can be named
      // after the page it was in the original
      const kept = pages
        ? parsePageRange(pages, count)
        : Array.from({ length: count }, (_, i) => i);
      for (const i of kept) {
        const page = new PDFDocument();
        page.graftPage(-1, source, i);
        const suffix = `-page-${String(i + 1).padStart(digits, "0")}`;
        outputFiles.push({
          name: changeExt(file.name, "pdf", suffix),
          bytes: save(page, "compress"),
        });
      }
      source.destroy();
    }
    return outputFiles;
  }
}

/** Puts each image on a page of its own in one PDF, the size of the image. */
export class imagesToPdfHandler implements FormatHandler {
  public readonly name = "imagesToPdf";
  public supportedFormats = [
    Formats.PNG.builder("png").from(),
    Formats.JPEG.builder("jpeg").from(),
    PDF_FROM_IMAGES.builder("pdf").lossless().to(),
  ];
  public ready = false;

  async init() {
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    _inputFormat: FileFormat,
    _outputFormat: FileFormat,
    _args?: string[],
    ctx?: ConvertContext,
  ): Promise<FileData[]> {
    const doc = new PDFDocument();
    for (const file of inputFiles) {
      ctx?.throwIfAborted();
      // mupdf keeps a JPEG as it is, without decoding and encoding it again
      const image = new Image(file.bytes);
      // a point is 1/72 inch, and an image without a resolution counts as 96 dpi
      const [width, height] = [
        (image.getWidth() * 72) / (image.getXResolution() || 96),
        (image.getHeight() * 72) / (image.getYResolution() || 96),
      ];
      const page = doc.addPage(
        [0, 0, width, height],
        0,
        { XObject: { Image: doc.addImage(image) } },
        `q ${width} 0 0 ${height} 0 0 cm /Image Do Q`,
      );
      doc.insertPage(-1, page);
    }
    return [{ name: changeExt(inputFiles[0].name, "pdf"), bytes: save(doc, "compress") }];
  }
}
