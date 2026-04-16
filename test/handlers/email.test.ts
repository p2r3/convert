import { expect, test } from "bun:test";
import emailHandler from "../../src/handlers/email.ts";
import CommonFormats from "../../src/CommonFormats.ts";

const SAMPLE_EMAIL = await Bun.file(`${import.meta.dir}/../resources/sample-email.eml`).bytes();

test("eml -> text strips attachments and decodes plain body", async () => {
  const handler = new emailHandler();
  const [output] = await handler.doConvert(
    [{ name: "sample-email.eml", bytes: SAMPLE_EMAIL }],
    handler.supportedFormats[0],
    CommonFormats.TEXT.builder("txt").allowTo()
  );

  const text = new TextDecoder().decode(output.bytes);
  expect(output.name).toBe("sample-email.txt");
  expect(text).toContain("Subject: Hello émail");
  expect(text).toContain("Hello plain world.");
  expect(text).toContain("This line has é and a soft wrapped word.");
  expect(text).not.toContain("SECRET-ATTACHMENT");
});

test("eml -> html prefers html part over attachment payload", async () => {
  const handler = new emailHandler();
  const [output] = await handler.doConvert(
    [{ name: "sample-email.eml", bytes: SAMPLE_EMAIL }],
    handler.supportedFormats[0],
    CommonFormats.HTML.builder("html").allowTo()
  );

  const html = new TextDecoder().decode(output.bytes);
  expect(output.name).toBe("sample-email.html");
  expect(html).toContain("<strong>HTML</strong>");
  expect(html).not.toContain("SECRET-ATTACHMENT");
});

test("eml -> markdown keeps readable content", async () => {
  const handler = new emailHandler();
  const [output] = await handler.doConvert(
    [{ name: "sample-email.eml", bytes: SAMPLE_EMAIL }],
    handler.supportedFormats[0],
    CommonFormats.MD.builder("markdown").allowTo()
  );

  const markdown = new TextDecoder().decode(output.bytes);
  expect(output.name).toBe("sample-email.markdown");
  expect(markdown).toContain("# Hello émail");
  expect(markdown).toContain("Hello plain world.");
  expect(markdown).not.toContain("SECRET-ATTACHMENT");
});
