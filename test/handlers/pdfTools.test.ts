import { expect, test } from "bun:test";
import { ColorSpace, Document, Font, Image, Matrix, PDFDocument, Pixmap } from "mupdf";
import type { ConversionSettings } from "../../src/ConversionSettings.ts";
import type { FileData } from "../../src/FormatHandler.ts";
import type { ConvertContext } from "../../src/ui/ProgressStore.ts";
import {
  compressPdfHandler,
  imagesToPdfHandler,
  parsePageRange,
  splitPdfHandler,
} from "../../src/handlers/pdfTools.ts";

const ctx = (settings: ConversionSettings) =>
  ({ settings, throwIfAborted() {}, progress() {}, log() {} }) as unknown as ConvertContext;

/** A PDF whose pages are 100, 200, 300... points wide, so that each can be told apart. */
function pdfWithPages(count: number, rotate: 0 | 90 = 0, bookmarkPage?: number) {
  const doc = new PDFDocument();
  for (let i = 0; i < count; i++) {
    doc.insertPage(-1, doc.addPage([0, 0, 100 * (i + 1), 100], rotate, {}, ""));
  }
  if (bookmarkPage) {
    doc.outlineIterator().insert({ title: "Chapter", uri: `#page=${bookmarkPage}`, open: false });
  }
  return new Uint8Array(doc.saveToBuffer("").asUint8Array());
}

const open = (file: FileData) => Document.openDocument(file.bytes, "application/pdf").asPDF()!;
const widths = (file: FileData) => {
  const doc = open(file);
  return Array.from({ length: doc.countPages() }, (_, i) => doc.loadPage(i).getBounds()[2]);
};

async function compress(bytes: Uint8Array, settings: ConversionSettings) {
  const handler = new compressPdfHandler();
  const [format] = handler.supportedFormats;
  const [output] = await handler.doConvert(
    [{ name: "doc.pdf", bytes }],
    format,
    format,
    [],
    ctx(settings),
  );
  return output;
}

test("parsePageRange reads pages and ranges in the order they were written", () => {
  expect(parsePageRange("2-5,8", 10)).toEqual([1, 2, 3, 4, 7]);
  expect(parsePageRange(" 3 - 1 ", 3)).toEqual([2, 1, 0]);
  expect(parsePageRange("4", 4)).toEqual([3]);
});

test("parsePageRange rejects what is not a page of this PDF", () => {
  for (const text of ["", "a", "2-", "1,,2", "1.5", "-3"]) {
    expect(() => parsePageRange(text, 5)).toThrow("is not a page or a range");
  }
  expect(() => parsePageRange("0", 5)).toThrow("Page 0 does not exist");
  expect(() => parsePageRange("2-6", 5)).toThrow("Page 6 does not exist: the PDF has 5 pages");
});

test("splitPdf writes one PDF per page, or per selected page", async () => {
  const handler = new splitPdfHandler();
  const [from, to] = handler.supportedFormats;
  const input = [{ name: "doc.pdf", bytes: pdfWithPages(3) }];

  const all = await handler.doConvert(input, from, to, [], ctx({}));
  expect(all.map((file) => file.name)).toEqual([
    "doc-page-1.pdf",
    "doc-page-2.pdf",
    "doc-page-3.pdf",
  ]);
  expect(all.map(widths)).toEqual([[100], [200], [300]]);

  // named after the page each one was in the original
  const some = await handler.doConvert(input, from, to, [], ctx({ pages: "3,1" }));
  expect(some.map((file) => file.name)).toEqual(["doc-page-3.pdf", "doc-page-1.pdf"]);
  expect(some.map(widths)).toEqual([[300], [100]]);
});

test("compressPdf keeps every page and gives a PDF that opens", async () => {
  const output = await compress(pdfWithPages(4), {});
  expect(output.name).toBe("doc.pdf");
  expect(widths(output)).toEqual([100, 200, 300, 400]);
});

test("compressPdf keeps only the selected pages", async () => {
  expect(widths(await compress(pdfWithPages(4), { pages: "2-3" }))).toEqual([200, 300]);
  await expect(compress(pdfWithPages(4), { pages: "9" })).rejects.toThrow("does not exist");
});

const rotation = (file: FileData) => open(file).findPage(0).getInheritable("Rotate").asNumber();

test("rotation is added to the rotation a page already has", async () => {
  expect(rotation(await compress(pdfWithPages(1), { rotate: 90 }))).toBe(90);
  expect(rotation(await compress(pdfWithPages(1, 90), { rotate: 90 }))).toBe(180);
  expect(rotation(await compress(pdfWithPages(1, 90), { rotate: 270 }))).toBe(0);
});

test("bookmarks survive a rotation and a page selection", async () => {
  const input = pdfWithPages(3, 0, 2);
  expect(open({ name: "", bytes: input }).loadOutline()).toHaveLength(1);

  for (const settings of [{ rotate: 90 }, { pages: "2-3" }]) {
    const outline = open(await compress(input, settings)).loadOutline();
    expect(outline?.map((item) => item.title)).toEqual(["Chapter"]);
  }
});

const SIZE = 256;

/** A one-page PDF showing a single RGB image whose samples come from `sample`. */
function pdfWithImage(sample: (index: number) => number) {
  const pixmap = new Pixmap(ColorSpace.DeviceRGB, [0, 0, SIZE, SIZE], false);
  const pixels = pixmap.getPixels();
  for (let i = 0; i < pixels.length; i++) pixels[i] = sample(i);

  const doc = new PDFDocument();
  const image = doc.addImage(new Image(pixmap));
  const contents = `q ${SIZE} 0 0 ${SIZE} 0 0 cm /Im0 Do Q`;
  doc.insertPage(-1, doc.addPage([0, 0, SIZE, SIZE], 0, { XObject: { Im0: image } }, contents));
  return new Uint8Array(doc.saveToBuffer("").asUint8Array());
}

const imageFilter = (file: FileData) =>
  open(file).findPage(0).get("Resources", "XObject", "Im0", "Filter").toString();

test("compressPdf re-encodes a photo as JPEG and the page still renders", async () => {
  // noise, which lossless compression cannot shrink and JPEG can
  let seed = 1;
  const input = pdfWithImage(() => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return seed >>> 24;
  });

  const lossless = await compress(input, {});
  const recompressed = await compress(input, { quality: 40 });
  expect(imageFilter(lossless)).toBe("/FlateDecode");
  expect(imageFilter(recompressed)).toBe("/DCTDecode");
  expect(recompressed.bytes.length).toBeLessThan(lossless.bytes.length);

  const rendered = open(recompressed)
    .loadPage(0)
    .toPixmap(Matrix.identity, ColorSpace.DeviceRGB, false);
  expect(rendered.getWidth()).toBe(SIZE);
  // a failed decode would leave the page white
  expect(rendered.getPixels().some((value) => value < 128)).toBe(true);
});

test("compressPdf leaves an image alone when a JPEG of it would be larger", async () => {
  // flat stripes, which lossless compression makes smaller than any JPEG
  const input = pdfWithImage((i) => (Math.floor(i / 3 / SIZE) % 2 ? 255 : 0));
  expect(imageFilter(await compress(input, { quality: 40 }))).toBe("/FlateDecode");
});

const text = (file: FileData, page = 0) => open(file).loadPage(page).toStructuredText().asText();

test("compressPdf locks a PDF with a password, and opens and unlocks it with one", async () => {
  const locked = await compress(pdfWithPages(2), { protect: "s3cret pass" });
  expect(open(locked).needsPassword()).toBe(true);
  await expect(compress(locked.bytes, {})).rejects.toThrow("is password protected");
  await expect(compress(locked.bytes, { password: "wrong" })).rejects.toThrow("is wrong");

  const unlocked = await compress(locked.bytes, { password: "s3cret pass" });
  expect(open(unlocked).needsPassword()).toBe(false);
  expect(widths(unlocked)).toEqual([100, 200]);

  // re-encoding saves in between, which must not leave the password on the way out or in
  const both = await compress(locked.bytes, { password: "s3cret pass", quality: 50 });
  expect(open(both).needsPassword()).toBe(false);
  const relocked = await compress(pdfWithPages(1), { protect: "x", quality: 50 });
  expect(open(relocked).needsPassword()).toBe(true);
});

test("splitPdf opens a protected PDF with its password", async () => {
  const locked = await compress(pdfWithPages(2), { protect: "pw" });
  const handler = new splitPdfHandler();
  const [from, to] = handler.supportedFormats;
  const pages = await handler.doConvert([locked], from, to, [], ctx({ password: "pw" }));
  expect(pages).toHaveLength(2);
});

test("compressPdf prints page numbers and a watermark over the page", async () => {
  const output = await compress(pdfWithPages(3), { pageNumbers: true, watermark: "Draft (copy)" });
  expect(text(output, 0)).toContain("1");
  expect(text(output, 2)).toContain("3");
  expect(text(output, 1)).toContain("Draft (copy)");
});

test("stamping keeps the fonts a page already had", async () => {
  // a page whose text needs a font from the resources it inherits from the page tree
  const doc = new PDFDocument();
  const font = doc.addSimpleFont(new Font("Times-Roman"));
  const page = doc.addPage([0, 0, 300, 100], 0, {}, "BT /Own 12 Tf 10 50 Td (Hello) Tj ET");
  doc.insertPage(-1, page);
  const tree = doc.getTrailer().get("Root", "Pages");
  tree.put("Resources", doc.newDictionary());
  tree.get("Resources").put("Font", doc.newDictionary());
  tree.get("Resources", "Font").put("Own", font);
  doc.findPage(0).delete("Resources");
  const bytes = new Uint8Array(doc.saveToBuffer("").asUint8Array());

  const output = await compress(bytes, { pageNumbers: true });
  expect(text(output)).toContain("Hello");
  expect(text(output)).toContain("1");
});

/** A grey PNG 48 pixels high and `width` wide. */
function png(width: number) {
  const pixmap = new Pixmap(ColorSpace.DeviceRGB, [0, 0, width, 48], false);
  pixmap.clear(200);
  return { name: `${width}.png`, bytes: new Uint8Array(pixmap.asPNG()) };
}

test("imagesToPdf puts each image on a page of its own size", async () => {
  const handler = new imagesToPdfHandler();
  const [from, , to] = handler.supportedFormats;
  const [output] = await handler.doConvert([png(96), png(192)], from, to, [], ctx({}));
  expect(output.name).toBe("96.pdf");
  // 96 pixels at 96 dpi are an inch, 72 points
  expect(widths(output)).toEqual([72, 144]);
});

const encrypted = (file: FileData) => !open(file).getTrailer().get("Encrypt").isNull();

test("a PDF with only an owner password stays locked, unless a password is given", async () => {
  const doc = Document.openDocument(pdfWithPages(1), "application/pdf").asPDF()!;
  const restricted = new Uint8Array(
    doc.saveToBuffer("encrypt=aes-256,owner-password=owner").asUint8Array(),
  );
  expect(encrypted({ name: "", bytes: restricted })).toBe(true);
  // it opens without a password, and compressing it keeps the restrictions
  expect(encrypted(await compress(restricted, {}))).toBe(true);
  // any password asks for it to be unlocked
  expect(encrypted(await compress(restricted, { password: "anything" }))).toBe(false);
});
