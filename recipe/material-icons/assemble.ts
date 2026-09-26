import { existsSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { extraExtensionToIcon } from "./extra-language-extensions";

const SOURCE_DIR = "vscode-material-icon-theme";
const ICONS_SRC = join(SOURCE_DIR, "icons");
const FILE_ICONS_TS = join(SOURCE_DIR, "src/core/icons/fileIcons.ts");
const OUT_BUNDLE = join(process.env.OUT_DIR!, "icons.json");

const FILE_SVG_PATH =
  "m8.668 6h3.6641l-3.6641-3.668v3.668m-4.668-4.668h5.332l4 4v8c0 0.73828-0.59375 1.3359-1.332 1.3359h-8c-0.73828 0-1.332-0.59766-1.332-1.3359v-10.664c0-0.74219 0.59375-1.3359 1.332-1.3359m3.332 1.3359h-3.332v10.664h8v-6h-4.668z";
const DEFAULT_FILE_COLOR = "#90a4ae";

interface FileIconEntry {
  name: string;
  fileExtensions: string[];
  cloneBase?: string;
}

function extractFileIconEntries(sourcePath: string): FileIconEntry[] {
  const source = readFileSync(sourcePath, "utf-8");
  const sf = ts.createSourceFile(
    sourcePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const out: FileIconEntry[] = [];

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (ts.isIdentifier(expr) && expr.text === "parseByPattern" && node.arguments.length > 0) {
        const arg = node.arguments[0];
        if (ts.isArrayLiteralExpression(arg)) {
          for (const el of arg.elements) {
            if (!ts.isObjectLiteralExpression(el)) continue;
            let name: string | undefined;
            const fileExtensions: string[] = [];
            let cloneBase: string | undefined;
            for (const prop of el.properties) {
              if (!ts.isPropertyAssignment(prop)) continue;
              const pn = prop.name;
              const key = ts.isIdentifier(pn) ? pn.text : ts.isStringLiteral(pn) ? pn.text : "";
              const init = prop.initializer;
              if (key === "name" && ts.isStringLiteral(init)) {
                name = init.text;
              }
              if (key === "fileExtensions" && ts.isArrayLiteralExpression(init)) {
                for (const e of init.elements) {
                  if (ts.isStringLiteral(e)) fileExtensions.push(e.text);
                }
              }
              if (key === "clone" && ts.isObjectLiteralExpression(init)) {
                for (const cp of init.properties) {
                  if (!ts.isPropertyAssignment(cp)) continue;
                  const cn = ts.isIdentifier(cp.name) ? cp.name.text : "";
                  if (cn === "base" && ts.isStringLiteral(cp.initializer)) {
                    cloneBase = cp.initializer.text;
                  }
                }
              }
            }
            if (name && fileExtensions.length > 0) {
              out.push({ name, fileExtensions, cloneBase });
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return out;
}

function resolveSourceIconPath(iconName: string, cloneBase: string | undefined): string | null {
  const candidates = [
    `${iconName}.svg`,
    `${iconName}.clone.svg`,
    ...(cloneBase ? [`${cloneBase}.svg`, `${cloneBase}.clone.svg`] : []),
    "document.svg",
  ];
  for (const c of candidates) {
    const p = join(ICONS_SRC, c);
    if (existsSync(p)) return p;
  }
  return null;
}

function main(): void {
  const entries = extractFileIconEntries(FILE_ICONS_TS);
  const extToLogical = new Map<string, string>();

  for (const e of entries) {
    for (const ext of e.fileExtensions) {
      extToLogical.set(ext.toLowerCase(), e.name);
    }
  }

  for (const [ext, logical] of Object.entries(extraExtensionToIcon)) {
    if (!extToLogical.has(ext)) {
      extToLogical.set(ext, logical);
    }
  }

  const logicalNames = new Set(extToLogical.values());
  logicalNames.add("file");

  const documentFallback = join(ICONS_SRC, "document.svg");

  const icons: Record<string, string> = {};
  function materializeIcon(logical: string): void {
    if (logical === "file") {
      icons.file = `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="${FILE_SVG_PATH}" fill="${DEFAULT_FILE_COLOR}" /></svg>`;
      return;
    }
    const entry = entries.find((x) => x.name === logical);
    const src = resolveSourceIconPath(logical, entry?.cloneBase);
    if (src) {
      icons[logical] = readFileSync(src, "utf-8");
    } else if (existsSync(documentFallback)) {
      icons[logical] = readFileSync(documentFallback, "utf-8");
    }
  }

  for (const logical of logicalNames) {
    materializeIcon(logical);
  }

  const extensionMap: Record<string, string> = {};
  for (const [ext, logical] of extToLogical.entries()) {
    extensionMap[ext] = logical;
  }

  writeFileSync(OUT_BUNDLE, JSON.stringify({ extensions: extensionMap, icons }), "utf-8");

  console.log(
    `[material-icons] wrote ${Object.keys(extensionMap).length} extension mappings and ${logicalNames.size} icons to ${OUT_BUNDLE}`,
  );
}

main();
