import { expect, test } from "bun:test";
import { Document, PDFDocument } from "mupdf";
import mergePdfHandler from "../../src/handlers/mergePdf.ts";

function pdfWithPages(count: number) {
  const doc = new PDFDocument();
  for (let i = 0; i < count; i++) doc.insertPage(-1, doc.addPage([0, 0, 100, 100], 0, {}, ""));
  return new Uint8Array(doc.saveToBuffer("").asUint8Array());
}

test("mergePdf joins every page of every input, in order, into one file", async () => {
  const handler = new mergePdfHandler();
  const [from, to] = handler.supportedFormats;
  const outputs = await handler.doConvert(
    [
      { name: "first.pdf", bytes: pdfWithPages(2) },
      { name: "second.pdf", bytes: pdfWithPages(3) },
    ],
    from,
    to,
  );

  expect(outputs.map((file) => file.name)).toEqual(["first-merged.pdf"]);
  expect(Document.openDocument(outputs[0].bytes, "application/pdf").countPages()).toBe(5);
});

test("mergePdf fails on a file that isn't a PDF instead of skipping it", async () => {
  const handler = new mergePdfHandler();
  const [from, to] = handler.supportedFormats;
  const junk = { name: "junk.pdf", bytes: new TextEncoder().encode("not a pdf") };
  await expect(handler.doConvert([junk], from, to)).rejects.toThrow();
});
