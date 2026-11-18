import Formats from "src/Formats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import parseXML from "built/envelope/parseXML.js";
import * as yaml from "yaml";
import { parse, unparse } from "papaparse";
import { changeExt, decode, encode } from "src/common/index.ts";
import type { ConvertContext } from "src/ui/ProgressStore.ts";
import { numberOption } from "src/Settings.ts";

const INDENT = { type: "number", label: "Indent", unit: "spaces", max: 8, integer: true } as const;

/// Converts things to JSON
export class toJsonHandler implements FormatHandler {
  public readonly name = "toJson";
  public supportedFormats = [
    Formats.CSV.builder("csv").from(),
    Formats.XML.builder("xml").from(),
    Formats.YML.builder("yaml").from(),
    Formats.JSONL.builder("jsonl").from(),
    Formats.JSON.builder("json")
      .lossless()
      .options({ indent: { ...INDENT, min: 0 } })
      .to(),
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
    return inputFiles.map((file) => {
      const name = changeExt(file.name, "json");
      const text = decode(file.bytes).trim();
      let object: any;
      switch (inputFormat.mime) {
        case "text/csv":
          ({ data: object } = parse(text, {
            header: true,
            skipEmptyLines: true,
          }));
          break;
        case "application/xml":
          object = parseXML(text);
          break;
        case "application/yaml":
          object = yaml.parse(text);
          break;
        case "application/jsonl":
          object = text
            .split("\n")
            .filter((l) => l.trim())
            .map((l) => JSON.parse(l));
          break;
        default:
          throw new Error("Unreachable");
      }
      return {
        name: name,
        bytes: encode(JSON.stringify(object, null, numberOption(ctx?.options, "indent"))),
      };
    });
  }
}

function xmlEscape(str: string): string {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

const XML_NAME = /^[\p{L}_][\p{L}\p{N}_.-]*$/u;

/** Open and close tags for `name`, falling back to `<Item key="name">` when it is no valid XML name. */
function xmlTags(name: string): [string, string] {
  if (XML_NAME.test(name)) return [`<${name}>`, `</${name}>`];
  return [`<Item key="${xmlEscape(name)}">`, "</Item>"];
}

/// Converts to things from JSON
export class fromJsonHandler {
  public readonly name = "fromJson";
  public ready = false;
  public supportedFormats = [
    Formats.CSV.builder("csv").to(),
    Formats.XML.builder("xml").to(),
    Formats.YML.builder("yaml")
      .options({ indent: { ...INDENT, min: 1 } })
      .to(),
    Formats.JSONL.builder("jsonl").to(),
    Formats.JSON.builder("json").from(),
  ];

  async init() {
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
    ctx?: ConvertContext,
  ): Promise<FileData[]> {
    return inputFiles.map((file) => {
      const name = changeExt(file.name, outputFormat.extension);
      let object = JSON.parse(decode(file.bytes));
      let text = "";
      switch (outputFormat.mime) {
        case "text/csv": {
          // hell
          if (!Array.isArray(object) && object && typeof object === "object") {
            object = Object.entries(object).map(([key, value]) => ({
              _key: key,
              ...(value && typeof value === "object" && !Array.isArray(value)
                ? value
                : { _value: value }),
            }));
          }
          if (!Array.isArray(object)) {
            object = [object];
          }
          object = object
            .map((r: any) => (r && typeof r === "object" ? r : { _value: r }))
            .map((r: any) => {
              for (const [key, value] of Object.entries(r)) {
                r[key] = value && typeof value === "object" ? JSON.stringify(value) : value;
              }
              return r;
            });
          const columns = [...new Set<string>(object.flatMap((r: object) => Object.keys(r)))];
          if (columns.length) text = unparse(object, { columns: columns, header: true });
          else text = "";
          break;
        }
        case "application/xml": {
          function write(value: any, tagName: string | null = null) {
            if (value === null || typeof value !== "object") {
              const str = xmlEscape(typeof value === "string" ? value : JSON.stringify(value));
              if (tagName != null) {
                const [open, close] = xmlTags(tagName);
                text += `${open}${str}${close}`;
              } else text += str;
              return;
            }
            if (Array.isArray(value)) {
              const [open, close] = xmlTags(tagName ?? "Array");
              text += open;
              for (const item of value) {
                write(item, "Item");
              }
              text += close;
              return;
            }
            const isXMLTag = typeof value._tag === "string" && Array.isArray(value._children); // is serialized XML tag
            if (isXMLTag) tagName ??= value._tag;
            const [open, close] = xmlTags(tagName ?? "Object");
            text += open;
            for (const [k, v] of Object.entries(value)) {
              if (isXMLTag && (k === "_tag" || k === "_children")) continue;
              write(v, k);
            }
            if (isXMLTag) {
              for (const child of value._children) {
                write(child);
              }
            }
            text += close;
          }
          write(object);
          break;
        }
        case "application/yaml": {
          const indent = numberOption(ctx?.options, "indent");
          // yaml rejects an explicit `indent: undefined`
          text = yaml.stringify(object, indent === undefined ? undefined : { indent });
          break;
        }
        case "application/jsonl":
          if (Array.isArray(object))
            text = object.map((r: any) => JSON.stringify(r)).join("\n") + "\n";
          else text = JSON.stringify(object);
          break;
        default:
          throw new Error("Unreachable");
      }
      return {
        name: name,
        bytes: encode(text),
      };
    });
  }
}
