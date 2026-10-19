import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import { FormatDefinition } from "../FormatHandler.ts";
import Formats, { Category } from "src/Formats.ts";
import { changeExt, encode } from "src/common/index.ts";
import msgreader from "@kenjiuno/msgreader";

// the package is CommonJS with a "default" export, and depending on the bundler this import is
// either the class or the module around it
const MsgReader = (msgreader as unknown as { default?: typeof msgreader }).default ?? msgreader;

const MSG = new FormatDefinition(
  "Outlook Message",
  "msg",
  "msg",
  "application/vnd.ms-outlook",
  Category.DOCUMENT,
);
const EML = new FormatDefinition("Email Message", "eml", "eml", "message/rfc822", [
  Category.DOCUMENT,
  Category.TEXT,
]);

export interface Address {
  name?: string;
  email?: string;
}

export interface Mail {
  subject: string;
  from: Address;
  to: Address[];
  cc: Address[];
  date?: Date;
  text: string;
  html?: string;
  attachments: { name: string; type?: string; bytes: Uint8Array }[];
}

const utf8 = new TextEncoder();

/** Base64 in lines of 76 characters, as MIME wants it. */
function base64(bytes: Uint8Array) {
  let binary = "";
  // in pieces, because one call with a large attachment would overflow the argument list
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/.{76}/g, "$&\r\n");
}

/**
 * A header value on one line. Line breaks are taken out, because a value that came from a
 * file could otherwise start a header of its own; text beyond ASCII becomes an encoded word.
 */
function header(value: string) {
  const line = value.replace(/[\r\n]+/g, " ").trim();
  if (/^[\x20-\x7e]*$/.test(line)) return line;
  return `=?UTF-8?B?${btoa(String.fromCharCode(...utf8.encode(line)))}?=`;
}

function addresses(list: Address[]) {
  return list
    .filter(({ name, email }) => name || email)
    .map(({ name, email }) => {
      // only what an address may hold, so that a name cannot pose as a second address
      const address = email?.replace(/[\s<>,;]/g, "");
      if (!name || name === email) return `<${address}>`;
      const display = header(name);
      const quoted = display.startsWith("=?") ? display : `"${display.replace(/["\\]/g, "")}"`;
      return address ? `${quoted} <${address}>` : quoted;
    })
    .join(", ");
}

const field = (name: string, value?: string) => (value ? `${name}: ${value}` : "");

function part(type: string, body: Uint8Array, extra: string[] = []) {
  return [`Content-Type: ${type}`, "Content-Transfer-Encoding: base64", ...extra, "", base64(body)];
}

function multipart(kind: string, parts: string[][]) {
  const boundary = `=_${crypto.randomUUID()}`;
  return [
    `Content-Type: multipart/${kind}; boundary="${boundary}"`,
    "",
    ...parts.flatMap((lines) => [`--${boundary}`, ...lines]),
    `--${boundary}--`,
  ];
}

/** Writes a message as an RFC 5322 email with MIME parts. */
export function buildEml(mail: Mail): Uint8Array<ArrayBuffer> {
  let body = part("text/plain; charset=utf-8", utf8.encode(mail.text));
  if (mail.html) {
    body = multipart("alternative", [
      body,
      part("text/html; charset=utf-8", utf8.encode(mail.html)),
    ]);
  }
  if (mail.attachments.length) {
    body = multipart("mixed", [
      body,
      ...mail.attachments.map(({ name, type, bytes }) => {
        const file = header(name).replace(/"/g, "");
        return part(`${header(type || "application/octet-stream")}; name="${file}"`, bytes, [
          `Content-Disposition: attachment; filename="${file}"`,
        ]);
      }),
    ]);
  }

  // a draft has no sender or no recipients yet, and a header without a value is not valid
  const headers = [
    field("From", addresses([mail.from])),
    field("To", addresses(mail.to)),
    field("Cc", addresses(mail.cc)),
    `Subject: ${header(mail.subject)}`,
    field("Date", mail.date?.toUTCString().replace("GMT", "+0000")),
    "MIME-Version: 1.0",
  ].filter(Boolean);
  return encode([...headers, ...body, ""].join("\r\n"));
}

function readMsg(file: FileData): Mail {
  const reader = new MsgReader(new Uint8Array(file.bytes).buffer);
  const data = reader.getFileData();
  if (data.error) throw new Error(`${file.name} could not be read as an Outlook message.`);

  const recipients = (kind: string) =>
    (data.recipients ?? [])
      .filter((recipient) => (recipient.recipType ?? "to") === kind)
      .map((recipient) => ({
        name: recipient.name,
        email: recipient.smtpAddress || recipient.email,
      }));
  const sent = data.messageDeliveryTime ?? data.clientSubmitTime ?? data.creationTime;
  const date = sent ? new Date(sent) : undefined;

  return {
    subject: data.subject ?? "",
    from: { name: data.senderName, email: data.senderSmtpAddress || data.senderEmail },
    to: recipients("to"),
    cc: recipients("cc"),
    date: date && !Number.isNaN(date.getTime()) ? date : undefined,
    text: data.body ?? "",
    html: data.bodyHtml ?? (data.html && new TextDecoder().decode(data.html)),
    attachments: (data.attachments ?? [])
      // an email inside an email has no bytes of its own to take out
      .filter((attachment) => !attachment.innerMsgContent)
      .map((attachment) => {
        const { fileName, content } = reader.getAttachment(attachment);
        return { name: fileName || "attachment", type: attachment.attachMimeTag, bytes: content };
      }),
  };
}

const names = (list: Address[]) => list.map(({ name, email }) => name || email).join(", ");

/** A message as plain text: who, when and what, without the attachments. */
function toText(mail: Mail) {
  const head = [
    field("From", names([mail.from])),
    field("To", names(mail.to)),
    field("Cc", names(mail.cc)),
    field("Date", mail.date?.toUTCString()),
    field("Subject", mail.subject),
    field("Attachments", mail.attachments.map(({ name }) => name).join(", ")),
  ].filter(Boolean);
  return [...head, "", mail.text].join("\n");
}

/** Reads Outlook .msg files and writes them as standard email or as text. */
class outlookMsgHandler implements FormatHandler {
  public readonly name = "outlookMsg";
  public supportedFormats = [
    MSG.builder("msg").from(),
    EML.builder("eml").lossless().to(),
    Formats.TEXT.builder("text").to(),
  ];
  public ready = false;

  async init() {
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    _inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {
    return inputFiles.map((file) => {
      const mail = readMsg(file);
      const bytes = outputFormat.internal === "eml" ? buildEml(mail) : encode(toText(mail));
      return { name: changeExt(file.name, outputFormat.extension), bytes };
    });
  }
}

export default outlookMsgHandler;
