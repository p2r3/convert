import type { FileData, FileFormat, FormatHandler } from "../src/FormatHandler";
import type { HandlerName } from "../src/handlers/index.ts";

/**
 * A mock implementation of the FormatHandler interface for testing purposes.
 * It allows you to specify supported formats and simulate conversions without performing actual processing.
 */
export class MockedHandler implements FormatHandler {
  constructor(
    public readonly name: HandlerName,
    public supportedFormats?: FileFormat[],
  ) {}
  public ready = false;
  init() {
    this.ready = true;
    return Promise.resolve();
  }
  doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {
    return Promise.resolve(inputFiles);
  }
}
