import { parseJSON, parseJSON5, parseJSONC, parseYAML, parseTOML, parseINI, stringifyJSON, stringifyJSON5, stringifyJSONC, stringifyYAML, stringifyTOML, stringifyINI } from "confbox";
import CommonFormats, { Category } from "src/CommonFormats.ts";
import { FormatDefinition, type FileData, type FileFormat, type FormatHandler } from "../FormatHandler.ts";

const JSON5_FORMAT = new FormatDefinition(
  "JSON5",
  "json5",
  "json5",
  "application/json5",
  Category.DATA
);

const JSONC_FORMAT = new FormatDefinition(
  "JSON Comments",
  "jsonc",
  "jsonc",
  "application/jsonc",
  Category.DATA
);

const TOML_FORMAT = new FormatDefinition(
  "Tom's Obvious, Minimal Language",
  "toml",
  "toml",
  "application/toml",
  Category.DATA
);

const INI_FORMAT = new FormatDefinition(
  "Initialization file",
  "ini",
  "ini",
  "text/plain",
  Category.DATA
);

class configHandler implements FormatHandler {
  public name: string = "config";
  public ready: boolean = true;

  public supportedFormats: FileFormat[] = [
    // JSON maintains exact data equivalence to JS Objects natively
    CommonFormats.JSON.builder("json").allowFrom().allowTo().markLossless(true),
    // JSON5, YAML, and TOML have comments and other features lost when parsed to JS Objects
    JSON5_FORMAT.builder("json5").allowFrom().allowTo().markLossless(false),
    JSONC_FORMAT.builder("jsonc").allowFrom().allowTo().markLossless(false),
    CommonFormats.YML.builder("yaml").allowFrom().allowTo().markLossless(false),
    CommonFormats.YML.builder("yaml").withExt("yaml").allowFrom().allowTo().markLossless(false),
    TOML_FORMAT.builder("toml").allowFrom().allowTo().markLossless(false),
    INI_FORMAT.builder("ini").allowFrom().allowTo().markLossless(false),
  ];

  async init() {
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {
    return inputFiles.map(file => {
      const baseName = file.name.split(".").slice(0, -1).join(".");
      const text = new TextDecoder().decode(file.bytes);
      
      let object: any;
      switch (inputFormat.internal) {
        case "json":
          object = parseJSON(text);
          break;
        case "json5":
          object = parseJSON5(text);
          break;
        case "jsonc":
          object = parseJSONC(text);
          break;
        case "yaml":
          object = parseYAML(text);
          break;
        case "toml":
          object = parseTOML(text);
          break;
        case "ini":
          object = parseINI(text);
          break;
        default:
          throw new Error(`Unsupported input internal format: ${inputFormat.internal}`);
      }

      let outText = "";
      switch (outputFormat.internal) {
        case "json":
          outText = stringifyJSON(object);
          break;
        case "json5":
          outText = stringifyJSON5(object);
          break;
        case "jsonc":
          outText = stringifyJSONC(object);
          break;
        case "yaml":
          outText = stringifyYAML(object);
          break;
        case "toml":
          outText = stringifyTOML(object);
          break;
        case "ini":
          outText = stringifyINI(object);
          break;
        default:
          throw new Error(`Unsupported output internal format: ${outputFormat.internal}`);
      }

      return {
        name: `${baseName}.${outputFormat.extension}`,
        bytes: new TextEncoder().encode(outText),
      };
    });
  }
}

export default configHandler;
