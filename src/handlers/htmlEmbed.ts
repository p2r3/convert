import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

class htmlEmbedHandler implements FormatHandler {

  public name: string = "htmlEmbed";
  public supportedFormats: FileFormat[] = [
    {
      name: "Hypertext Markup Language",
      format: "html",
      extension: "html",
      mime: "text/html",
      from: false,
      to: true,
      internal: "html"
    },
    {
      name: "Portable Network Graphics",
      format: "png",
      extension: "png",
      mime: "image/png",
      from: true,
      to: false,
      internal: "png"
    },
    {
      name: "Joint Photographic Experts Group JFIF",
      format: "jpeg",
      extension: "jpg",
      mime: "image/jpeg",
      from: true,
      to: false,
      internal: "jpeg"
    },
    {
      name: "WebP",
      format: "webp",
      extension: "webp",
      mime: "image/webp",
      from: true,
      to: false,
      internal: "webp"
    },
    {
      name: "CompuServe Graphics Interchange Format (GIF)",
      format: "gif",
      extension: "gif",
      mime: "image/gif",
      from: true,
      to: false,
      internal: "gif"
    },
    {
      name: "Scalable Vector Graphics",
      format: "svg",
      extension: "svg",
      mime: "image/svg+xml",
      from: true,
      to: false,
      internal: "svg"
    },
    {
      name: "Plain Text",
      format: "text",
      extension: "txt",
      mime: "text/plain",
      from: true,
      to: false,
      internal: "text"
    },
    {
      name: "MPEG-4 Part 14",
      format: "mp4",
      extension: "mp4",
      mime: "video/mp4",
      from: true,
      to: false,
      internal: "mp4"
    },
    {
      name: "MP3 Audio",
      format: "mp3",
      extension: "mp3",
      mime: "audio/mpeg",
      from: true,
      to: false,
      internal: "mp3"
    }
  ];
  public ready: boolean = false;

  async init () {
    this.ready = true;
  }

  static bytesToBase64 (bytes: Uint8Array): string {
    const chunks = [];
    for (let i = 0; i < bytes.length; i += 32768) {
      const byteChunk = bytes.subarray(i, i + 32768);
      chunks.push(String.fromCharCode(...byteChunk));
    }
    return btoa(chunks.join(""));
  }

  async doConvert (
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {

    if (outputFormat.internal !== "html") throw "Invalid output format.";

    const encoder = new TextEncoder();
    let html = "";

    if (inputFormat.internal === "text") {
      const decoder = new TextDecoder();
      for (const inputFile of inputFiles) {
        const text = decoder.decode(inputFile.bytes)
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;");
        html += `<p>${text}</p><br>`;
      }
    } else {
      for (const inputFile of inputFiles) {

        const base64 = htmlEmbedHandler.bytesToBase64(inputFile.bytes);

        if (inputFormat.mime.startsWith("image/")) {
          html += `<image src="data:${inputFormat.mime};base64,${base64}"><br>`;
        } else if (inputFormat.mime.startsWith("audio/")) {
          html += `<audio controls>
            <source src="data:${inputFormat.mime};base64,${base64}" type="${inputFormat.mime}"></source>
          </audio><br>`;
        } else {
          html += `<video controls>
            <source src="data:${inputFormat.mime};base64,${base64}" type="${inputFormat.mime}"></source>
          </video><br>`;
        }

      }
    }

    const bytes = encoder.encode(html);
    const name = inputFiles[0].name.split(".").slice(0, -1).join(".") + "." + outputFormat.extension;
    return [{ bytes, name }];

  }

}

export default htmlEmbedHandler;