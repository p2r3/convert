import { expect, test } from "bun:test";
import { jsonToTs } from "../../src/handlers/jsonToTs.ts";

test("jsonToTs describes nested objects as interfaces of their own", () => {
  const ts = jsonToTs({ id: 1, name: "a", owner: { email: "e", "first-name": "f" } });

  expect(ts).toBe(
    "export interface Root {\n  id: number;\n  name: string;\n  owner: Owner;\n}\n\n" +
      'export interface Owner {\n  email: string;\n  "first-name": string;\n}\n',
  );
});

test("jsonToTs merges the objects of a list, with optional keys and unions", () => {
  const ts = jsonToTs({
    users: [
      { id: 1, email: "e" },
      { id: "2", admin: true },
    ],
    tags: [],
  });

  expect(ts).toContain("  users: User[];\n  tags: unknown[];");
  expect(ts).toContain(
    "export interface User {\n  id: string | number;\n  email?: string;\n  admin?: boolean;\n}",
  );
});

test("jsonToTs names a root that is not an object", () => {
  expect(jsonToTs([{ a: 1 }], "Users")).toBe(
    "export type Users = User[];\n\nexport interface User {\n  a: number;\n}\n",
  );
  expect(jsonToTs([1, "a", null])).toBe("export type Root = (string | number | null)[];\n");
  expect(jsonToTs(5)).toBe("export type Root = number;\n");
});
