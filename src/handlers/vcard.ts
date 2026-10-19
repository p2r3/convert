import type { FileData, FormatHandler } from "../FormatHandler.ts";
import Formats from "src/Formats.ts";
import { changeExt, decode, encode } from "src/common/index.ts";

/** The vCard properties that are kept, with the name each gets in the output. */
const COLUMNS: Record<string, string> = {
  FN: "Name",
  ORG: "Organization",
  TITLE: "Title",
  TEL: "Phone",
  EMAIL: "Email",
  ADR: "Address",
  URL: "Website",
  BDAY: "Birthday",
  NOTE: "Note",
};

/**
 * Reads the contacts of a vCard file, versions 2.1 to 4.0.
 * Every contact has the same keys, so that the list also makes a table. A property that a
 * contact has more than once, such as two phone numbers, is joined with "; ".
 *
 * shortcut: values in the quoted-printable encoding of vCard 2.1 are left as they are.
 * Decode them when exports from old phones matter.
 */
export function parseVcards(text: string): Record<string, string>[] {
  const contacts: Record<string, string>[] = [];
  let values: Record<string, string[]> | undefined;

  // a line that starts with a space or a tab continues the line before it
  for (const line of text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/)) {
    const marker = line.trim().toUpperCase();
    if (marker === "BEGIN:VCARD") {
      values = {};
      continue;
    }
    if (marker === "END:VCARD" && values) {
      const all = values;
      const [family = "", given = ""] = all.N?.[0]?.split(";") ?? [];
      contacts.push({
        ...Object.fromEntries(
          Object.entries(COLUMNS).map(([property, column]) => [
            column,
            (all[property] ?? []).join("; "),
          ]),
        ),
        "Given name": given,
        "Family name": family,
      });
      values = undefined;
      continue;
    }

    const colon = line.indexOf(":");
    if (!values || colon === -1) continue;
    // "item1.TEL;TYPE=cell" is the property TEL
    const property = line.slice(0, colon).split(";")[0].split(".").pop()!.toUpperCase();
    let value = line.slice(colon + 1).trim();
    if (property !== "N") {
      // the parts of an address or an organisation, without the empty ones
      value = value
        .split(/(?<!\\);/)
        .map((part) => part.trim())
        .filter(Boolean)
        .join(", ");
    }
    value = value.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1");
    if (value) (values[property] ??= []).push(value);
  }
  return contacts;
}

/** Turns a vCard file into JSON. The JSON handler takes that on to CSV. */
class vcardHandler implements FormatHandler {
  public readonly name = "vcard";
  public supportedFormats = [Formats.VCF.builder("vcf").from(), Formats.JSON.builder("json").to()];
  public ready = false;

  async init() {
    this.ready = true;
  }

  async doConvert(inputFiles: FileData[]): Promise<FileData[]> {
    return inputFiles.map((file) => {
      const contacts = parseVcards(decode(file.bytes));
      if (!contacts.length) throw new Error(`${file.name} has no contacts.`);
      return {
        name: changeExt(file.name, "json"),
        bytes: encode(JSON.stringify(contacts, null, 2)),
      };
    });
  }
}

export default vcardHandler;
