import { expect, test } from "bun:test";
import * as XLSX from "../../built/sheetjs/xlsx.mjs";
import type { FileFormat } from "../../src/FormatHandler.ts";
import sheetjsHandler from "../../src/handlers/sheetjs.ts";

const handler = new sheetjsHandler();
const format = (internal: string) =>
  handler.supportedFormats.find((f) => f.internal === internal) as FileFormat;
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const csvFile = (content: string) => [
  { name: "table.csv", bytes: new TextEncoder().encode(content) },
];

test("a CSV survives the trip through each workbook format, accents included", async () => {
  const csv = "naam,stad,aantal\nZoë,Curaçao,12\nJürgen,Zürich,3.5";
  for (const book of ["xlsx", "biff8", "ods"]) {
    const [workbook] = await handler.doConvert(csvFile(csv), format("csv"), format(book));
    expect(workbook.name).toBe(`table.${format(book).extension}`);
    const [back] = await handler.doConvert([workbook], format(book), format("csv"));
    expect(back.name).toBe("table.csv");
    expect(text(back.bytes)).toBe(csv);
  }
});

test("a workbook with several sheets becomes one CSV per sheet", async () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["a", 1]]), "First");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["b", 2]]), "Second");
  const bytes = new Uint8Array(XLSX.write(workbook, { bookType: "xlsx", type: "array" }));

  const files = await handler.doConvert(
    [{ name: "book.xlsx", bytes }],
    format("xlsx"),
    format("csv"),
  );

  expect(files.map((file) => file.name)).toEqual(["book-First.csv", "book-Second.csv"]);
  expect(files.map((file) => text(file.bytes))).toEqual(["a,1", "b,2"]);
});

test("a file that is no workbook is refused", async () => {
  const junk = [{ name: "junk.xlsx", bytes: new Uint8Array([80, 75, 3, 4, 0, 0, 0, 0]) }];
  await expect(handler.doConvert(junk, format("xlsx"), format("csv"))).rejects.toThrow();
});
