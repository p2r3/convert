import Formats from "src/Formats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import sqlite3InitModule, { type SqlValue } from "@sqlite.org/sqlite-wasm";
import { parse } from "papaparse";
import { decode, encode } from "src/common/index.ts";

class sqliteHandler implements FormatHandler {
  public readonly name = "sqlite";
  public supportedFormats = [
    Formats.SQLITE3.builder("sqlite3").fromTo(),
    Formats.ITDB.builder("sqlite3").from(),
    // Lossy because extracts only tables
    Formats.CSV.builder("csv").fromTo(),
  ];
  public ready = false;

  async init() {
    this.ready = true;
  }

  getTables(db: any) {
    const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table';");
    let row: any[] = [];
    try {
      while (stmt.step()) {
        row.push(stmt.get(0));
      }
    } finally {
      stmt.finalize();
    }
    return row;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];
    console.log(inputFormat, outputFormat);

    const sqlite3 = await sqlite3InitModule();

    if (inputFormat.internal === "sqlite3" && outputFormat.internal === "csv") {
      for (const file of inputFiles) {
        const p = sqlite3.wasm.allocFromTypedArray(file.bytes);

        const db = new sqlite3.oo1.DB();
        if (!db.pointer) {
          throw new Error("Database pointer is undefined");
        }
        const flags = sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE;
        const rc = sqlite3.capi.sqlite3_deserialize(
          db.pointer,
          "main",
          p,
          file.bytes.byteLength,
          file.bytes.byteLength,
          flags,
        );
        db.checkRc(rc);

        for (const table of this.getTables(db)) {
          const stmt = db.prepare(`SELECT * FROM ${quoteIdent(table)}`);
          let csvStr = stmt.getColumnNames().map(csvField).join(",") + "\n";
          try {
            while (stmt.step()) {
              const row = Array.from({ length: stmt.columnCount }, (_, j) => stmt.get(j));
              csvStr += row.map(csvField).join(",") + "\n";
            }
          } finally {
            stmt.finalize();
          }

          outputFiles.push({
            name: `${table}.csv`,
            bytes: encode(csvStr),
          });
        }
      }
    }
    if (inputFormat.internal === "csv" && outputFormat.internal === "sqlite3") {
      const db = new sqlite3.oo1.DB();
      if (!db.pointer) {
        throw new Error("Database pointer is undefined");
      }

      for (const file of inputFiles) {
        parse<string[]>(decode(file.bytes), {
          header: false,
          skipEmptyLines: true,
          complete: function (result) {
            const tableName = quoteIdent(file.name.replace(/\.csv$/i, ""));
            const header = result.data[0];
            if (!header?.length) throw new Error(`${file.name} has no header row.`);
            const firstRow = result.data.at(1);

            const schema = inferSchema(header, firstRow);
            const columns = schema.map(([name]) => quoteIdent(name));
            db.exec(
              `CREATE TABLE ${tableName} (${schema.map(([name, type]) => `${quoteIdent(name)} ${type}`).join(", ")})`,
            );

            const insert = db.prepare(
              `INSERT INTO ${tableName} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
            );
            try {
              db.transaction(() => {
                for (const row of result.data.slice(1)) {
                  insert.bind(schema.map(([, type], i) => toSqlValue(row[i], type)));
                  insert.stepReset();
                }
              });
            } finally {
              insert.finalize();
            }
          },
        });
      }
      let bfr = sqlite3.capi.sqlite3_js_db_export(db);
      outputFiles.push({
        name: "database.db",
        bytes: bfr,
      });
    }

    return outputFiles;
  }
}

export default sqliteHandler;

/** Formats a value as a CSV field: NULL becomes empty, blobs hex, and fields that need it are quoted. */
function csvField(value: SqlValue): string {
  if (value === null) return "";
  if (typeof value === "object") {
    return ArrayBuffer.isView(value)
      ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength).toHex()
      : new Uint8Array(value).toHex();
  }
  const text = String(value);
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Quotes an SQL identifier. */
function quoteIdent(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

/** A CSV cell as a value to bind. */
function toSqlValue(value: string | undefined, type: string): SqlValue {
  if (value === undefined || value === "") return null;
  if (type !== "TEXT") {
    const number = Number(value);
    if (!Number.isNaN(number)) return number;
  }
  return value;
}

function inferType(value: string | undefined): string {
  if (value === undefined) return "TEXT";
  if (!isNaN(Number(value))) {
    if (Number.isInteger(Number(value))) return "INTEGER";
    return "REAL";
  }
  return "TEXT";
}

function inferSchema(header: string[], row?: string[]): [string, string][] {
  return header.map((h, i) => {
    const type = inferType(row?.[i]);
    return [h, type];
  });
}
