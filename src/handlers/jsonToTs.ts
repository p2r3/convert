import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import Formats from "src/Formats.ts";
import { changeExt, decode, encode, stripExt } from "src/common/index.ts";

/** What all the values seen at one place in the JSON have in common. */
interface Shape {
  primitives: Set<"string" | "number" | "boolean" | "null">;
  /** Present once an object was seen. `seen` counts in how many of them each key appeared. */
  object?: { fields: Map<string, Shape>; seen: Map<string, number>; count: number };
  /** Present once an array was seen: the shape of all its elements together. */
  array?: Shape;
}

const empty = (): Shape => ({ primitives: new Set() });

function shapeOf(value: unknown): Shape {
  const shape = empty();
  if (value === null) shape.primitives.add("null");
  else if (Array.isArray(value)) shape.array = value.map(shapeOf).reduce(merge, empty());
  else if (typeof value === "object") {
    const entries = Object.entries(value);
    shape.object = {
      fields: new Map(entries.map(([key, v]) => [key, shapeOf(v)])),
      seen: new Map(entries.map(([key]) => [key, 1])),
      count: 1,
    };
  } else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    shape.primitives.add(typeof value as "string" | "number" | "boolean");
  return shape;
}

function merge(a: Shape, b: Shape): Shape {
  const shape: Shape = { primitives: new Set([...a.primitives, ...b.primitives]) };
  if (a.array || b.array) shape.array = merge(a.array ?? empty(), b.array ?? empty());
  if (a.object && b.object) {
    const fields = new Map(a.object.fields);
    const seen = new Map(a.object.seen);
    for (const [key, field] of b.object.fields) {
      fields.set(key, fields.has(key) ? merge(fields.get(key)!, field) : field);
      seen.set(key, (seen.get(key) ?? 0) + b.object.seen.get(key)!);
    }
    shape.object = { fields, seen, count: a.object.count + b.object.count };
  } else shape.object = a.object ?? b.object;
  return shape;
}

const pascalCase = (key: string) =>
  key
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join("")
    .replace(/^(?=\d)/, "_") || "Item";

/** A rough singular, for the interface of what a list such as "users" holds. */
const singular = (name: string) =>
  name.length > 3 && name.endsWith("ies")
    ? name.slice(0, -3) + "y"
    : name.length > 3 && name.endsWith("s") && !name.endsWith("ss")
      ? name.slice(0, -1)
      : name;

/**
 * Writes TypeScript interfaces that describe a JSON value. Keys missing from some of the objects
 * in a list become optional, and places that hold several kinds of value become unions.
 */
export function jsonToTs(value: unknown, rootName = "Root"): string {
  const interfaces: string[] = [];
  const taken = new Set<string>();
  const reserve = (name: string) => {
    let unique = name;
    for (let n = 2; taken.has(unique); n++) unique = `${name}${n}`;
    taken.add(unique);
    return unique;
  };

  function typeOf(shape: Shape, name: string): string {
    const parts: string[] = [];
    if (shape.object) {
      const object = shape.object;
      const interfaceName = reserve(name);
      // reserved before the fields are visited, so that the outer interface comes first
      const index = interfaces.push("") - 1;
      const lines = [...object.fields].map(([key, field]) => {
        const optional = object.seen.get(key)! < object.count ? "?" : "";
        const property = /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);
        return `  ${property}${optional}: ${typeOf(field, pascalCase(key))};`;
      });
      interfaces[index] = `export interface ${interfaceName} {\n${lines.join("\n")}\n}\n`;
      parts.push(interfaceName);
    }
    if (shape.array) {
      const element = typeOf(shape.array, singular(name));
      parts.push(element.includes(" | ") ? `(${element})[]` : `${element}[]`);
    }
    for (const primitive of ["string", "number", "boolean", "null"] as const) {
      if (shape.primitives.has(primitive)) parts.push(primitive);
    }
    return parts.join(" | ") || "unknown";
  }

  const root = shapeOf(value);
  // a list at the root is named for one of its elements: "users.json" holds User objects
  const element = singular(rootName) === rootName ? `${rootName}Item` : singular(rootName);
  const type = typeOf(root, root.object ? rootName : element);
  // a root that is anything but a plain object gets a name of its own
  if (type !== rootName) interfaces.unshift(`export type ${reserve(rootName)} = ${type};\n`);
  return interfaces.join("\n");
}

class jsonToTsHandler implements FormatHandler {
  public readonly name = "jsonToTs";
  public supportedFormats = [
    Formats.JSON.builder("json").from(),
    Formats.TYPESCRIPT.builder("ts").to(),
  ];
  public ready = false;

  async init() {
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    _inputFormat: FileFormat,
    _outputFormat: FileFormat,
  ): Promise<FileData[]> {
    return inputFiles.map((file) => {
      let value: unknown;
      try {
        value = JSON.parse(decode(file.bytes));
      } catch {
        throw new Error(`${file.name} is not valid JSON.`);
      }
      return {
        name: changeExt(file.name, "ts"),
        bytes: encode(jsonToTs(value, pascalCase(stripExt(file.name)) || "Root")),
      };
    });
  }
}

export default jsonToTsHandler;
