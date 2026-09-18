import { FileData, FileFormat, FormatHandler } from "../src/FormatHandler";

/**
 * A mock implementation of the FormatHandler interface for testing purposes.
 * It allows you to specify supported formats and simulate conversions without performing actual processing.
 */
export class MockedHandler implements FormatHandler {
  constructor(
    public name: string,
    public supportedFormats?: FileFormat[],
    public supportAnyInput?: boolean,
  ) {}
  ready: boolean = false;
  offload: boolean = false;
  init() {
    this.ready = true;
    return Promise.resolve();
  }
  doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
    _args?: string[],
  ): Promise<FileData[]> {
    return Promise.resolve(inputFiles);
  }
}
