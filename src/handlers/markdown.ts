import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import { unified, type Processor } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import rehypeParse from "rehype-parse";
import rehypeRemark from "rehype-remark";
import remarkStringify from "remark-stringify";
import remarkGfm from "remark-gfm";

class markdownHandler implements FormatHandler {

  public name = "markdown";
  public supportedFormats = [
    {
      name: "Markdown Document",
      format: "md",
      extension: "md",
      mime: "text/markdown",
      from: true,
      to: true,
      internal: "md"
    },
    {
      name: "HyperText Markup Language",
      format: "html",
      extension: "html",
      mime: "text/html",
      from: true,
      to: true,
      internal: "html"
    }
  ];
  public ready = false;

  private htmlToMarkdownPipeline?: Processor<any, any, any, any, string>;
  private markdownToHtmlPipeline?: Processor<any, any, any, any, string>;

  async init() {
    this.markdownToHtmlPipeline = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkRehype)
      .use(rehypeStringify);
    this.htmlToMarkdownPipeline = unified()
      .use(rehypeParse)
      .use(rehypeRemark)
      .use(remarkGfm)
      .use(remarkStringify);
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];

    if (!this.htmlToMarkdownPipeline || !this.markdownToHtmlPipeline) {
      throw "Handler not initialized.";
    }

    for (const file of inputFiles) {
      const inputText = new TextDecoder().decode(file.bytes);
      let outputText: string;

      if (inputFormat.internal === "md" && outputFormat.internal === "html") {
        const result = await this.markdownToHtmlPipeline!.process(inputText);
        outputText = result.toString();
      } else if (inputFormat.internal === "html" && outputFormat.internal === "md") {
        const result = await this.htmlToMarkdownPipeline!.process(inputText);
        outputText = result.toString();
      } else {
        throw "Invalid output format.";
      }

      const outputBytes = new TextEncoder().encode(outputText);
      const outputName = file.name.split(".").slice(0, -1).join(".") + "." + outputFormat.extension;

      outputFiles.push({
        name: outputName,
        bytes: new Uint8Array(outputBytes)
      });
    }

    return outputFiles;
  }

}

export default markdownHandler;
