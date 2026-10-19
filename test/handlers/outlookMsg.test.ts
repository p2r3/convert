import { expect, test } from "bun:test";
import { buildEml, type Mail } from "../../src/handlers/outlookMsg.ts";

const mail: Mail = {
  subject: "Quarterly numbers",
  from: { name: "Anna de Vries", email: "anna@example.com" },
  to: [{ name: "Bob", email: "bob@example.com" }, { email: "carol@example.com" }],
  cc: [],
  date: new Date("2026-10-12T08:30:00Z"),
  text: "See the attachment.",
  attachments: [],
};
const eml = (overrides: Partial<Mail> = {}) =>
  new TextDecoder().decode(buildEml({ ...mail, ...overrides }));
const unbase64 = (block: string) =>
  new TextDecoder().decode(Uint8Array.from(atob(block.replace(/\s/g, "")), (c) => c.charCodeAt(0)));

test("buildEml writes the headers and a plain text body", () => {
  const [head, body] = eml().split("\r\n\r\n");

  expect(head.split("\r\n")).toEqual([
    'From: "Anna de Vries" <anna@example.com>',
    'To: "Bob" <bob@example.com>, <carol@example.com>',
    "Subject: Quarterly numbers",
    "Date: Mon, 12 Oct 2026 08:30:00 +0000",
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
  ]);
  expect(unbase64(body)).toBe("See the attachment.");
});

test("buildEml leaves out the headers a draft has no value for", () => {
  const head = eml({ from: {}, to: [], date: undefined }).split("\r\n\r\n")[0];

  expect(head.split("\r\n").slice(0, 2)).toEqual([
    "Subject: Quarterly numbers",
    "MIME-Version: 1.0",
  ]);
});

test("buildEml keeps text beyond ASCII in headers and bodies", () => {
  const out = eml({
    subject: "Überraschung für Zoë",
    from: { name: "Jürgen", email: "j@example.com" },
    text: "€ 5",
  });

  const subject = /^Subject: =\?UTF-8\?B\?(.+)\?=$/m.exec(out)![1];
  expect(unbase64(subject)).toBe("Überraschung für Zoë");
  expect(out).toMatch(/^From: =\?UTF-8\?B\?.+\?= <j@example\.com>$/m);
  expect(unbase64(out.split("\r\n\r\n")[1])).toBe("€ 5");
});

test("buildEml does not let a value from the file start a header or an address of its own", () => {
  const out = eml({
    subject: "Hello\r\nBcc: thief@example.com",
    from: { name: 'Mallory" <admin@example.com>, "x', email: "m@example.com>, <n@example.com" },
  });
  const head = out.split("\r\n\r\n")[0];

  expect(head).not.toMatch(/^Bcc:/m);
  expect(head).toContain("Subject: Hello Bcc: thief@example.com");
  // one address, and the quotes that would have closed the display name are gone
  expect(/^From: (.*)$/m.exec(head)![1]).toBe(
    '"Mallory <admin@example.com>, x" <m@example.comn@example.com>',
  );
});

test("buildEml nests the alternatives inside the mixed part with attachments", () => {
  const bytes = new Uint8Array(200).map((_, i) => i);
  const out = eml({
    html: "<p>See the <b>attachment</b>.</p>",
    attachments: [{ name: "numbers.bin", type: "application/x-test", bytes }],
  });

  const boundaries = [...out.matchAll(/boundary="([^"]+)"/g)].map((match) => match[1]);
  expect(boundaries).toHaveLength(2);
  expect(out).toMatch(/Content-Type: multipart\/mixed; boundary=/);
  expect(out).toMatch(/Content-Type: multipart\/alternative; boundary=/);
  expect(out).toContain('Content-Disposition: attachment; filename="numbers.bin"');
  // every boundary is opened for each of its parts and closed once
  for (const boundary of boundaries) expect(out).toContain(`--${boundary}--`);
  const attachment = out.split('filename="numbers.bin"\r\n\r\n')[1].split("\r\n--")[0];
  expect(attachment.split("\r\n").every((line) => line.length <= 76)).toBe(true);
  expect(Uint8Array.from(atob(attachment.replace(/\s/g, "")), (c) => c.charCodeAt(0))).toEqual(
    bytes,
  );
});
