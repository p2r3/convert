import { expect, test } from "bun:test";
import vcardHandler, { parseVcards } from "../../src/handlers/vcard.ts";

const CARDS = `BEGIN:VCARD\r
VERSION:3.0\r
N:Vries;Anna de;;;\r
FN:Anna de Vries\r
ORG:Acme\\, Inc.;Research\r
item1.TEL;TYPE=CELL:+31 6 1234 5678\r
TEL;TYPE=WORK:+31 20 123 4567\r
EMAIL:anna@example.com\r
ADR;TYPE=HOME:;;Dorpsstraat 1;Amsterdam;;1011 AB;Netherlands\r
NOTE:Met on a very long line that the file wraps\r
  onto a second one\\nand a new line\r
PHOTO;ENCODING=b:AAAA\r
END:VCARD\r
begin:vcard
FN:Only A Name
end:vcard
`;

test("parseVcards reads names, repeated properties and folded lines", () => {
  const [anna, other] = parseVcards(CARDS);

  expect(anna).toEqual({
    Name: "Anna de Vries",
    Organization: "Acme, Inc., Research",
    Title: "",
    Phone: "+31 6 1234 5678; +31 20 123 4567",
    Email: "anna@example.com",
    Address: "Dorpsstraat 1, Amsterdam, 1011 AB, Netherlands",
    Website: "",
    Birthday: "",
    Note: "Met on a very long line that the file wraps onto a second one and a new line",
    "Given name": "Anna de",
    "Family name": "Vries",
  });
  // the same keys for every contact, so that the list is also a table
  expect(Object.keys(other)).toEqual(Object.keys(anna));
  expect(other.Name).toBe("Only A Name");
});

test("the handler writes the contacts as JSON and refuses a file without any", async () => {
  const handler = new vcardHandler();
  const bytes = new TextEncoder().encode(CARDS);
  const [output] = await handler.doConvert([{ name: "people.vcf", bytes }]);

  expect(output.name).toBe("people.json");
  expect(JSON.parse(new TextDecoder().decode(output.bytes))).toHaveLength(2);
  const empty = [{ name: "empty.vcf", bytes: new TextEncoder().encode("hello") }];
  await expect(handler.doConvert(empty)).rejects.toThrow("has no contacts");
});
