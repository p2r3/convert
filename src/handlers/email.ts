import { FormatDefinition, type FileData, type FileFormat, type FormatHandler } from "../FormatHandler.ts";
import CommonFormats, { Category } from "src/CommonFormats.ts";

const EML_FORMAT = new FormatDefinition(
  "Email Message",
  "eml",
  "eml",
  "message/rfc822",
  [Category.DOCUMENT, Category.TEXT]
);

type ParsedHeaders = Record<string, string>;

type ExtractedEmailContent = {
  textParts: string[];
  htmlParts: string[];
};

function parseHeaders(headerText: string): ParsedHeaders {
  const headers: ParsedHeaders = {};
  let currentKey = "";

  for (const rawLine of headerText.replace(/\r\n/g, "\n").split("\n")) {
    if (!rawLine) continue;
    if ((rawLine.startsWith(" ") || rawLine.startsWith("\t")) && currentKey) {
      headers[currentKey] += " " + rawLine.trim();
      continue;
    }

    const separatorIndex = rawLine.indexOf(":");
    if (separatorIndex === -1) continue;

    currentKey = rawLine.slice(0, separatorIndex).trim().toLowerCase();
    headers[currentKey] = rawLine.slice(separatorIndex + 1).trim();
  }

  return headers;
}

function splitMessage(raw: string) {
  const match = raw.match(/\r?\n\r?\n/);
  if (!match || match.index == null) {
    return {
      headers: parseHeaders(raw),
      body: ""
    };
  }

  const separatorLength = match[0].length;
  const headerText = raw.slice(0, match.index);
  const body = raw.slice(match.index + separatorLength);

  return {
    headers: parseHeaders(headerText),
    body
  };
}

function parseHeaderParameters(headerValue = "") {
  const [typePart, ...parameterParts] = headerValue.split(";");
  const parameters: Record<string, string> = {};

  for (const parameterPart of parameterParts) {
    const separatorIndex = parameterPart.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = parameterPart.slice(0, separatorIndex).trim().toLowerCase();
    let value = parameterPart.slice(separatorIndex + 1).trim();
    if (value.startsWith("\"") && value.endsWith("\"")) {
      value = value.slice(1, -1);
    }
    parameters[key] = value;
  }

  return {
    value: typePart.trim().toLowerCase(),
    parameters
  };
}

function quotedPrintableToBytes(input: string) {
  const normalized = input.replace(/=\r?\n/g, "");
  const bytes: number[] = [];

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    if (char === "=" && /^[0-9A-Fa-f]{2}$/.test(normalized.slice(i + 1, i + 3))) {
      bytes.push(parseInt(normalized.slice(i + 1, i + 3), 16));
      i += 2;
      continue;
    }
    bytes.push(normalized.charCodeAt(i));
  }

  return new Uint8Array(bytes);
}

function base64ToBytes(input: string) {
  const normalized = input.replace(/\s+/g, "");
  if (!normalized) return new Uint8Array();

  if (typeof atob === "function") {
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  return new Uint8Array(Buffer.from(normalized, "base64"));
}

function decodeCharset(bytes: Uint8Array, charset?: string) {
  const labels = [
    charset?.trim().toLowerCase(),
    "utf-8"
  ].filter((label): label is string => Boolean(label));

  for (const label of labels) {
    try {
      return new TextDecoder(label).decode(bytes);
    } catch (_) {
    }
  }

  return new TextDecoder().decode(bytes);
}

function decodeTransferEncodedBody(body: string, encoding?: string, charset?: string) {
  const normalizedEncoding = (encoding || "").trim().toLowerCase();

  if (normalizedEncoding === "quoted-printable") {
    return decodeCharset(quotedPrintableToBytes(body), charset);
  }

  if (normalizedEncoding === "base64") {
    return decodeCharset(base64ToBytes(body), charset);
  }

  return decodeCharset(new TextEncoder().encode(body), charset);
}

function splitMultipartBody(body: string, boundary: string) {
  const marker = `--${boundary}`;
  const endMarker = `--${boundary}--`;
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const parts: string[] = [];
  let currentPart: string[] | null = null;

  for (const line of lines) {
    if (line === marker) {
      if (currentPart) {
        parts.push(currentPart.join("\n"));
      }
      currentPart = [];
      continue;
    }

    if (line === endMarker) {
      if (currentPart) {
        parts.push(currentPart.join("\n"));
      }
      break;
    }

    if (currentPart) {
      currentPart.push(line);
    }
  }

  return parts.filter(part => part.trim().length > 0);
}

function extractEmailContent(raw: string): ExtractedEmailContent {
  const { headers, body } = splitMessage(raw);
  const contentType = parseHeaderParameters(headers["content-type"] || "text/plain; charset=utf-8");
  const disposition = parseHeaderParameters(headers["content-disposition"] || "");
  const transferEncoding = headers["content-transfer-encoding"];

  const isAttachment = disposition.value === "attachment"
    || Boolean(disposition.parameters.filename);
  if (isAttachment) {
    return { textParts: [], htmlParts: [] };
  }

  if (contentType.value.startsWith("multipart/") && contentType.parameters.boundary) {
    return splitMultipartBody(body, contentType.parameters.boundary).reduce<ExtractedEmailContent>((acc, part) => {
      const extracted = extractEmailContent(part);
      acc.textParts.push(...extracted.textParts);
      acc.htmlParts.push(...extracted.htmlParts);
      return acc;
    }, { textParts: [], htmlParts: [] });
  }

  if (contentType.value === "message/rfc822") {
    const nested = decodeTransferEncodedBody(body, transferEncoding, contentType.parameters.charset);
    return extractEmailContent(nested);
  }

  if (contentType.value === "text/plain") {
    return {
      textParts: [decodeTransferEncodedBody(body, transferEncoding, contentType.parameters.charset)],
      htmlParts: []
    };
  }

  if (contentType.value === "text/html") {
    return {
      textParts: [],
      htmlParts: [decodeTransferEncodedBody(body, transferEncoding, contentType.parameters.charset)]
    };
  }

  return { textParts: [], htmlParts: [] };
}

function decodeEncodedWord(value: string) {
  return value.replace(/=\?([^?]+)\?([bBqQ])\?([^?]+)\?=/g, (_, charset: string, mode: string, encoded: string) => {
    if (mode.toUpperCase() === "B") {
      return decodeCharset(base64ToBytes(encoded), charset);
    }

    const qpInput = encoded.replace(/_/g, " ");
    return decodeCharset(quotedPrintableToBytes(qpInput), charset);
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function htmlToText(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<li>/gi, "- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildMetadata(headers: ParsedHeaders) {
  const subject = headers.subject ? decodeEncodedWord(headers.subject) : "(No subject)";
  const from = headers.from ? decodeEncodedWord(headers.from) : "";
  const to = headers.to ? decodeEncodedWord(headers.to) : "";
  const date = headers.date ? decodeEncodedWord(headers.date) : "";

  return { subject, from, to, date };
}

class emailHandler implements FormatHandler {
  public name = "email";
  public ready = true;

  public supportedFormats: FileFormat[] = [
    EML_FORMAT.builder("eml").allowFrom(),
    CommonFormats.TEXT.builder("txt").allowTo(),
    CommonFormats.HTML.builder("html").allowTo(),
    CommonFormats.MD.builder("markdown").allowTo()
  ];

  async init() {
    this.ready = true;
  }

  private getBaseName(fileName: string) {
    return fileName.replace(/\.[^.]+$/, "");
  }

  private convertToText(raw: string) {
    const { headers } = splitMessage(raw);
    const content = extractEmailContent(raw);
    const metadata = buildMetadata(headers);
    const body = (content.textParts.find(part => part.trim()) || htmlToText(content.htmlParts.find(part => part.trim()) || "")).trim();

    return [
      `Subject: ${metadata.subject}`,
      metadata.from ? `From: ${metadata.from}` : "",
      metadata.to ? `To: ${metadata.to}` : "",
      metadata.date ? `Date: ${metadata.date}` : "",
      "",
      body
    ].filter(Boolean).join("\n");
  }

  private convertToMarkdown(raw: string) {
    const { headers } = splitMessage(raw);
    const content = extractEmailContent(raw);
    const metadata = buildMetadata(headers);
    const body = (content.textParts.find(part => part.trim()) || htmlToText(content.htmlParts.find(part => part.trim()) || "")).trim();

    return [
      `# ${metadata.subject}`,
      metadata.from ? `From: ${metadata.from}` : "",
      metadata.to ? `To: ${metadata.to}` : "",
      metadata.date ? `Date: ${metadata.date}` : "",
      "",
      body
    ].filter(Boolean).join("\n");
  }

  private convertToHtml(raw: string) {
    const { headers } = splitMessage(raw);
    const content = extractEmailContent(raw);
    const metadata = buildMetadata(headers);
    const htmlBody = content.htmlParts.find(part => part.trim());
    const textBody = content.textParts.find(part => part.trim()) || "";

    const renderedBody = htmlBody
      ? htmlBody
      : `<pre>${escapeHtml(textBody)}</pre>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(metadata.subject)}</title>
</head>
<body>
  <h1>${escapeHtml(metadata.subject)}</h1>
  ${metadata.from ? `<p><strong>From:</strong> ${escapeHtml(metadata.from)}</p>` : ""}
  ${metadata.to ? `<p><strong>To:</strong> ${escapeHtml(metadata.to)}</p>` : ""}
  ${metadata.date ? `<p><strong>Date:</strong> ${escapeHtml(metadata.date)}</p>` : ""}
  <hr>
  ${renderedBody}
</body>
</html>`;
  }

  async doConvert(inputFiles: FileData[], inputFormat: FileFormat, outputFormat: FileFormat) {
    const encoder = new TextEncoder();

    return inputFiles.map(file => {
      const raw = new TextDecoder().decode(file.bytes);
      let output = "";

      if (outputFormat.mime === CommonFormats.TEXT.mime) {
        output = this.convertToText(raw);
      } else if (outputFormat.mime === CommonFormats.HTML.mime) {
        output = this.convertToHtml(raw);
      } else if (outputFormat.mime === CommonFormats.MD.mime) {
        output = this.convertToMarkdown(raw);
      } else {
        throw new Error(`emailHandler cannot convert to ${outputFormat.mime}`);
      }

      return {
        name: `${this.getBaseName(file.name)}.${outputFormat.extension}`,
        bytes: encoder.encode(output)
      };
    });
  }
}

export default emailHandler;
