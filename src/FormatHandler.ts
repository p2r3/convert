
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
  category?: Array<string> | string
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

export type HandlerOptionValue = boolean | number | string | string[];

export interface HandlerOptionChoice {
  label: string;
  value: string;
  description?: string;
}

export type HandlerOptionVisibilityContext = Readonly<Record<string, HandlerOptionValue>>;

interface HandlerOptionBase<TKind extends string, TValue extends HandlerOptionValue> {
  kind: TKind;
  id: string;
  name: string;
  description?: string;
  section?: string;
  defaultValue?: TValue;
  showWhen?: (values: HandlerOptionVisibilityContext) => boolean;
  getValue: () => TValue;
  setValue: (value: TValue) => void;
}

export interface ToggleOptionDefinition extends HandlerOptionBase<"toggle", boolean> {}

export interface NumberOptionDefinition extends HandlerOptionBase<"number", number> {
  min?: number;
  max?: number;
  step?: number;
  control?: "input" | "slider";
  unit?: string;
}

export interface TextOptionDefinition extends HandlerOptionBase<"text", string> {
  inputType?: "text" | "email" | "url" | "password";
  placeholder?: string;
  minLength?: number;
  maxLength?: number;
  multiline?: boolean;
}

export interface SelectOptionDefinition extends HandlerOptionBase<"select", string> {
  choices: HandlerOptionChoice[];
}

export interface MultiSelectOptionDefinition extends HandlerOptionBase<"multiselect", string[]> {
  choices: HandlerOptionChoice[];
}

export type HandlerOptionDefinition =
  | ToggleOptionDefinition
  | NumberOptionDefinition
  | TextOptionDefinition
  | SelectOptionDefinition
  | MultiSelectOptionDefinition;

export class ToggleOption implements ToggleOptionDefinition {
  public readonly kind = "toggle" as const;
  constructor(
    public id: string,
    public name: string,
    public getValue: () => boolean,
    public setValue: (value: boolean) => void,
    public defaultValue?: boolean,
    public description?: string,
    public section?: string,
    public showWhen?: (values: HandlerOptionVisibilityContext) => boolean
  ) {}
}

export class NumberOption implements NumberOptionDefinition {
  public readonly kind = "number" as const;
  public min?: number;
  public max?: number;
  public step?: number;
  public control?: "input" | "slider";
  public unit?: string;
  public defaultValue?: number;
  public description?: string;
  public section?: string;
  public showWhen?: (values: HandlerOptionVisibilityContext) => boolean;

  constructor(
    public id: string,
    public name: string,
    public getValue: () => number,
    public setValue: (value: number) => void,
    config: {
      min?: number;
      max?: number;
      step?: number;
      control?: "input" | "slider";
      unit?: string;
      defaultValue?: number;
      description?: string;
      section?: string;
      showWhen?: (values: HandlerOptionVisibilityContext) => boolean;
    } = {}
  ) {
    Object.assign(this, config);
  }
}

export class TextOption implements TextOptionDefinition {
  public readonly kind = "text" as const;
  public inputType?: "text" | "email" | "url" | "password";
  public placeholder?: string;
  public minLength?: number;
  public maxLength?: number;
  public multiline?: boolean;
  public defaultValue?: string;
  public description?: string;
  public section?: string;
  public showWhen?: (values: HandlerOptionVisibilityContext) => boolean;

  constructor(
    public id: string,
    public name: string,
    public getValue: () => string,
    public setValue: (value: string) => void,
    config: {
      inputType?: "text" | "email" | "url" | "password";
      placeholder?: string;
      minLength?: number;
      maxLength?: number;
      multiline?: boolean;
      defaultValue?: string;
      description?: string;
      section?: string;
      showWhen?: (values: HandlerOptionVisibilityContext) => boolean;
    } = {}
  ) {
    Object.assign(this, config);
  }
}

export class SelectOption implements SelectOptionDefinition {
  public readonly kind = "select" as const;
  public defaultValue?: string;
  public description?: string;
  public section?: string;
  public showWhen?: (values: HandlerOptionVisibilityContext) => boolean;

  constructor(
    public id: string,
    public name: string,
    public choices: HandlerOptionChoice[],
    public getValue: () => string,
    public setValue: (value: string) => void,
    config: {
      defaultValue?: string;
      description?: string;
      section?: string;
      showWhen?: (values: HandlerOptionVisibilityContext) => boolean;
    } = {}
  ) {
    Object.assign(this, config);
  }
}

export class MultiSelectOption implements MultiSelectOptionDefinition {
  public readonly kind = "multiselect" as const;
  public defaultValue?: string[];
  public description?: string;
  public section?: string;
  public showWhen?: (values: HandlerOptionVisibilityContext) => boolean;

  constructor(
    public id: string,
    public name: string,
    public choices: HandlerOptionChoice[],
    public getValue: () => string[],
    public setValue: (value: string[]) => void,
    config: {
      defaultValue?: string[];
      description?: string;
      section?: string;
      showWhen?: (values: HandlerOptionVisibilityContext) => boolean;
    } = {}
  ) {
    Object.assign(this, config);
  }
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
      lossless: lossless ?? false
    }
  }

  /**
   * Returns a builder to fluently create FileFormat.
   * Builder can be used to create FileFormat based on this format definition
   */
  builder(ref: string) {
    const def = this;

    const builder = {
      // FileFormat fields
      name: def.name,
      format: def.format,
      extension: def.extension,
      mime: def.mime,
      category: def.category,
      internal: ref,
      from: false,
      to: false,
      lossless: false,

      allowFrom(value: boolean = true) {
        this.from = value;
        return this;
      },
      allowTo(value: boolean = true) {
        this.to = value;
        return this;
      },
      markLossless(value: boolean = true) {
        this.lossless = value;
        return this;
      },
      named(name: string) {
        this.name = name;
        return this;
      },
      withFormat(format: string) {
        this.format = format;
        return this;
      },
      withExt(ext: string) {
        this.extension = ext;
        return this;
      },
      withMime(mimetype: string) {
        this.mime = mimetype;
        return this;
      },
      /**
       * Replaces format category
       */
      withCategory(category: string[] | string | undefined) {
        this.category = category
        return this
      },
      override(values: Partial<IFormatDefinition>) {
        Object.assign(this, values);
        return this;
      },
    };

    return builder as FileFormat & typeof builder;
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
  /** Optional list of user-configurable options. */
  getOptions?: () => HandlerOptionDefinition[];

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
   * @param ctx Optional {@link ConvertContext} for progress reporting.
   * @returns Array of {@link FileData} entries, one per generated output file.
   */
  doConvert: (
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
    args?: string[],
    ctx?: import("./ui/ProgressStore.js").ConvertContext
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
