
/**
 * Definition of file format. Contains format defined constants like mime type and names
 */
export interface IFormatDefinition {
  /** Format description (long name) for displaying to the user. */
  name: string;
  /** Short, "formal" name for displaying to the user. */
  format: string;
  /** File extension. */
  extension: string;
  /** MIME type. */
  mime: string;
  /** Category for grouping formats. */
  category?: Array<string> | string
}

export interface FileFormat extends IFormatDefinition {
  /** Whether conversion **from** this format is supported. */
  from: boolean;
  /** Whether conversion **to** this format is supported. */
  to: boolean;
  /** Format identifier for the handler's internal reference. */
  internal: string;
  /** Whether the format is lossless (if applicable). */
  lossless?: boolean;
}

/**
 * Class containing format definition and method used to produce FileFormat
 * that can be supported by handlers.
 */
export class FormatDefinition implements IFormatDefinition {
  public readonly name: string;
  public readonly format: string;
  public readonly extension: string;
  public readonly mime: string;
  public readonly category?: string[] | string;

  constructor(
    name: string, 
    format: string, 
    extension: string, 
    mime: string, 
    category?: string[] | string
  ) {
    this.name = name
    this.format = format
    this.extension = extension
    this.mime = mime
    this.category = category
  }

  /**
   * Returns `FileFormat` object that uses this format definition
   * and specified options
   * @param ref Format identifier for the handler's internal reference.
   * @param from Whether conversion **from** this format is supported.
   * @param to Whether conversion **to** this format is supported.
   * @param lossless (Optional) Whether the format is lossless in this context. Defaults to `false`.
   * @param override Format definition values to override
   * @returns 
   */
  supported(ref: string, from: boolean, to: boolean, lossless?: boolean, override: Partial<IFormatDefinition> = {}): FileFormat {
    return {
      ...this,
      ...override,
      internal: ref,
      from: from,
      to: to,
      lossless: lossless
    }
  }

  /**
   * Returns a builder to fluently create FileFormat
   */
  builder() {
    // Initialize flags
    const def = this
    const flags: { from: boolean; to: boolean; lossless?: boolean; override: Partial<IFormatDefinition> } = {
      from: false,
      to: false,
      override: {}
    }

    // Return the builder object with chainable methods
    return {
      allowFrom() {
        flags.from = true
        return this
      },
      allowTo() {
        flags.to = true
        return this
      },
      markLossless() {
        flags.lossless = true
        return this
      },
      override(values: Partial<IFormatDefinition>) {
        flags.override = { ...flags.override, ...values }
        return this
      },
      supported(ref: string) {
        return def.supported(ref, flags.from, flags.to, flags.lossless, flags.override)
      }
    }
  }
}


export interface FileData {
  /** File name with extension. */
  name: string;
  /**
   * File contents in bytes.
   *
   * **Please note:** _handlers_ are responsible for ensuring the lifetime
   * and consistency of this buffer. If you're not sure that your handler
   * won't modify it, wrap it in `new Uint8Array()`.
   */
  readonly bytes: Uint8Array;
}

/**
 * Establishes a common interface for converting between file formats.
 * Often a "wrapper" for existing tools.
 */
export interface FormatHandler {
  /** Name of the tool being wrapped (e.g. "FFmpeg"). */
  name: string;
  /** List of supported input/output {@link FileFormat}s. */
  supportedFormats?: FileFormat[];

  /** Whether the handler supports input of any type.
   * Conversion using this handler will be performed only if no other direct conversion is found.
   */
  supportAnyInput?: boolean;

  /**
   * Whether the handler is ready for use. Should be set in {@link init}.
   * If true, {@link doConvert} is expected to work.
   */
  ready: boolean;
  /**
   * Initializes the handler if necessary.
   * Should set {@link ready} to true.
   */
  init: () => Promise<void>;
  /**
   * Performs the actual file conversion.
   * @param inputFiles Array of {@link FileData} entries, one per input file.
   * @param inputFormat Input {@link FileFormat}, the same for all inputs.
   * @param outputFormat Output {@link FileFormat}, the same for all outputs.
   * @param args Optional arguments as a string array.
   * Can be used to perform recursion with different settings.
   * @returns Array of {@link FileData} entries, one per generated output file.
   */
  doConvert: (
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
    args?: string[]
  ) => Promise<FileData[]>;
}

export class ConvertPathNode {
  public handler: FormatHandler;
  public format: FileFormat;
  constructor(handler: FormatHandler, format: FileFormat) {
    this.handler = handler;
    this.format = format;
  }
}
