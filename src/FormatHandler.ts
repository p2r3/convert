import type { CategoryType } from "./Formats.js";
import type { HandlerName } from "./handlers/index.js";
import type { ConvertContext } from "./ui/ProgressStore.js";

/**
 * Definition of file format. Contains format defined constants like mime type and names
 */
export interface IFormatDefinition {
  /** Format description (long name) for displaying to the user. */
  name: string;
  /** Short, "formal" name for displaying to the user, and for
   * differentiating between files of identical MIME types.
   * If your file is different from others of the same MIME type,
   * then this string should be used to differentiate it. */
  format: string;
  /** File extension. */
  extension: string;
  /** MIME type. */
  mime: string;
  /** Category for grouping formats. */
  category: CategoryType[] | CategoryType;
}

export interface FileFormat extends IFormatDefinition {
  /** Whether conversion **from** this format is supported. */
  from: boolean;
  /** Whether conversion **to** this format is supported. */
  to: boolean;
  /** Format identifier for the handler's internal reference. */
  internal: string;
  /** (Optional) Whether the format is lossless in this context. Defaults to `false`. */
  lossless?: boolean;
}

/** Unique identifier of a format across handlers, e.g. `image/png(png)`. */
export const formatIdentifier = (format: IFormatDefinition) => `${format.mime}(${format.format})`;

/** Whether both are the same format, regardless of which handler they come from. */
export const sameFormat = (a: IFormatDefinition | null | undefined, b: IFormatDefinition) =>
  a?.mime === b.mime && a.format === b.format;

/**
 * Class containing format definition and method used to produce FileFormat
 * that can be supported by handlers.
 */
export class FormatDefinition implements IFormatDefinition {
  public readonly name: string;
  public readonly format: string;
  public readonly extension: string;
  public readonly mime: string;
  public readonly category: CategoryType[] | CategoryType;

  constructor(
    name: string,
    format: string,
    extension: string,
    mime: string,
    category: CategoryType[] | CategoryType,
  ) {
    this.name = name;
    this.format = format;
    this.extension = extension;
    this.mime = mime;
    this.category = category;
  }

  /**
   * Returns a builder to fluently create FileFormat based on this format definition.
   * Finish the chain with {@link FormatBuilder.from}, {@link FormatBuilder.to},
   * {@link FormatBuilder.fromTo} or {@link FormatBuilder.nowhere}.
   * @param internal Format identifier for the handler's internal reference.
   */
  builder(internal: string) {
    return new FormatBuilder(this, internal);
  }
}

/**
 * Fluent builder for {@link FileFormat}. {@link lossless} comes first if needed; the chain
 * ends with {@link from}, {@link to}, {@link fromTo} or {@link nowhere}, which return the
 * built `FileFormat`.
 * Losslessness defaults to `false`.
 */
export class FormatBuilder {
  #format: FileFormat;

  constructor(definition: IFormatDefinition, internal: string) {
    this.#format = {
      ...structuredClone(definition),
      internal,
      from: false,
      to: false,
      lossless: false,
    };
  }

  /** Marks the format as lossless in this context. */
  lossless(value: boolean = true) {
    this.#format.lossless = value;
    return this;
  }
  /** Builds a format that only allows conversion **from** it. */
  from(value: boolean = true): FileFormat {
    return this.fromTo(value, false);
  }
  /** Builds a format that only allows conversion **to** it. */
  to(value: boolean = true): FileFormat {
    return this.fromTo(false, value);
  }
  /** Builds a format that allows conversion **from** and **to** it. */
  fromTo(from: boolean = true, to: boolean = true): FileFormat {
    return { ...structuredClone(this.#format), from, to };
  }
  /** Builds a format that does not allow conversion. */
  nowhere(): FileFormat {
    return this.fromTo(false, false);
  }
}

/** Describes a file.
 *
 * **Please note:** _handlers_ are responsible for ensuring the lifetime
 * and consistency of the buffer and the immutability of the object as a whole
 * when passed as input.
 */
export interface FileData {
  /** File name with extension.
   *
   * **Please note:** _handlers_ are responsible for ensuring the lifetime
   * and consistency of the buffer and the immutability of the object as a whole
   * when passed as input.
   */
  readonly name: string;
  /**
   * File contents in bytes.
   *
   * **Please note:** _handlers_ are responsible for ensuring the lifetime
   * and consistency of the buffer and the immutability of the object as a whole
   * when passed as input. If you're not sure that your handler won't modify
   * this, wrap it in `new Uint8Array()`.
   */
  readonly bytes: Uint8Array;
}

export interface HandlerDefinition {
  /** Name of the tool being wrapped (e.g. "FFmpeg"). Include it in [src/handlers/index.ts](src/handlers/index.ts) in order to be valid */
  readonly name: HandlerName;
  /** List of supported input/output {@link FileFormat}s. */
  supportedFormats?: FileFormat[];

  /** Whether the handler supports input of any type.
   * Conversion using this handler will be performed only if no other direct conversion is found.
   */
  readonly supportAnyInput?: boolean;

  /** Whether the handler supports running in a Web Worker.
   * Unless you are doing something extraordinary, this should be enabled. If you plan to disable it,
   * your reason better be REALLY good. Try replacing `HTMLCanvasElement` -> `OffscreenCanvas`
   * (`toBlob()` -> `convertToBlob()`), `new Image()` -> `createImageBitmap()`, using linkedom
   * and avoiding audio APIs.
   * Defaults to `true`.
   */
  readonly offload?: boolean;

  /** Whether the handler supports graceful aborting.
   * Usually you should either listen to the "abort" event of ctx.signal, or poll ctx.throwIfAborted() in long loops.
   * The handler is responsible for making sure that internal state is not corrupted if any abort happens.
   * Defaults to `false`.
   */
  readonly abortable?: boolean;
}

/**
 * Establishes a common interface for converting between file formats.
 * Often a "wrapper" for existing tools.
 */
export interface FormatHandler extends HandlerDefinition {
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
   * @param ctx Optional {@link ConvertContext} for progress reporting.
   * @returns Array of {@link FileData} entries, one per generated output file.
   */
  doConvert: (
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
    ctx?: ConvertContext,
  ) => Promise<FileData[]>;
}

export class ConvertPathNode {
  public handler: HandlerDefinition;
  public format: FileFormat;
  constructor(handler: HandlerDefinition, format: FileFormat) {
    this.handler = handler;
    this.format = format;
  }
}

export function stripHandler(handler: HandlerDefinition): HandlerDefinition {
  return structuredClone({
    name: handler.name,
    supportAnyInput: handler.supportAnyInput,
    supportedFormats: handler.supportedFormats,
    offload: handler.offload,
    abortable: handler.abortable,
  });
}
