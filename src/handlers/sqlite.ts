import CommonFormats from "src/CommonFormats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import {parse} from "papaparse";

class sqlite3Handler implements FormatHandler {

  public name: string = "sqlite3";
  public supportedFormats?: FileFormat[];
  public ready: boolean = false;

  async init () {
    this.supportedFormats = [
      {
        name: "SQLite3",
        format: "sqlite3",
        extension: "db",
        mime: "application/vnd.sqlite3",
        from: true,
        to: true,
        internal: "sqlite3",
        category: "database"
      },
      {
        name: "iTunes Database",
        format: "itdb",
        extension: "itdb",
        mime: "application/vnd.sqlite3",
        from: true,
        to: false,
        internal: "sqlite3",
        category: "database"
      },
      // Lossy because extracts only tables  
      CommonFormats.CSV.builder("csv").allowTo().allowFrom()
    ];
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

  async doConvert (
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];
    console.log(inputFormat, outputFormat);

    const sqlite3 = await sqlite3InitModule();

    if (inputFormat.internal == "sqlite3" && outputFormat.internal == "csv") {
        for (const file of inputFiles) {
            const p = sqlite3.wasm.allocFromTypedArray(file.bytes);

            const db = new sqlite3.oo1.DB();
            if (!db.pointer) {
                throw new Error("Database pointer is undefined")
            }
            const flags = sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE;
            const rc = sqlite3.capi.sqlite3_deserialize(
                db.pointer,
                "main",
                p,
                file.bytes.byteLength,
                file.bytes.byteLength,
                flags
            );
            db.checkRc(rc);

            
            for (const table of this.getTables(db)) {
                const stmt = db.prepare(`SELECT * FROM ${table}`);
                let csvStr = stmt.getColumnNames().join(",") + "\n";
                try {
                  while (stmt.step()) {
                    const row = Array.from({length: stmt.columnCount }, (_, j) => stmt.get(j))
                    csvStr += row.join(", ") + "\n"
                  }
                } finally {
                    stmt.finalize();
                }

                const encoder = new TextEncoder()
                outputFiles.push({
                    name: `${table}.csv`,
                    bytes: new Uint8Array(encoder.encode(csvStr))
                })
            }
         }
    }
    if (inputFormat.internal == "csv" && outputFormat.internal == "sqlite3") {
        const db = new sqlite3.oo1.DB();
        if (!db.pointer) {
            throw new Error("Database pointer is undefined")
        }

        
        for (const file of inputFiles) {
          const decoder = new TextDecoder('utf-8'); // decode as UTF-8
          parse(decoder.decode(file.bytes), { 
            header: false,
            skipEmptyLines: true,
            complete: function(result) {
              const tableName = file.name.replace(".csv", "")
              const header = result.data[0] as string[];
              const firstRow = result.data[1] as string[];

              const schema = inferSchema(header, firstRow);
                        console.log(schema);
              db.exec(`CREATE TABLE ${tableName} (${schema.map(v => v.join(" ")).join(", ")})`)

              for (const row of result.data.slice(1) as string[][]) {
                db.exec(`INSERT INTO ${tableName} (${header}) VALUES (${row.map((v, i) => formatValue(v, schema[i][1]))})`)
              } 
            }
          });
        }
        let bfr = sqlite3.capi.sqlite3_js_db_export(db);
        outputFiles.push({
            name: "database.db",
            bytes: bfr
        });
      }




    return outputFiles;
  }
}

export default sqlite3Handler;

function formatValue(value: string, type: string) {
    value = value.substring(1); // Strip of space from left
    if (value == "") return "NULL";
    if (type === "TEXT") return `'${value.replace(/'/g, "''")}'`;
    return value;
}
function inferType(value: string): string {
if (!isNaN(Number(value))) {
  if (Number.isInteger(Number(value))) return "INTEGER"
  return "REAL"
}
return "TEXT";
}

function inferSchema(header: string[], row: string[]): string[][] {
  return header.map((h, i) => {
    const type = inferType(row[i]);
    return [h, type];
  })
}
