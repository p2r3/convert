import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, copyFileSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { extraExtensionToIcon } from "./extra-language-extensions";

const REPO_URL = "https://github.com/material-extensions/vscode-material-icon-theme.git";
const CACHE_DIR = join(process.cwd(), ".cache/material-icon-theme");
const ICONS_SRC = join(CACHE_DIR, "icons");
const FILE_ICONS_TS = join(CACHE_DIR, "src/core/icons/fileIcons.ts");
const OUT_PUBLIC = join(process.cwd(), "public/material-file-icons");
const OUT_ICONS = join(OUT_PUBLIC, "icons");
const OUT_MAP = join(OUT_PUBLIC, "extension-map.json");

const FILE_SVG_PATH =
	"m8.668 6h3.6641l-3.6641-3.668v3.668m-4.668-4.668h5.332l4 4v8c0 0.73828-0.59375 1.3359-1.332 1.3359h-8c-0.73828 0-1.332-0.59766-1.332-1.3359v-10.664c0-0.74219 0.59375-1.3359 1.332-1.3359m3.332 1.3359h-3.332v10.664h8v-6h-4.668z";
const DEFAULT_FILE_COLOR = "#90a4ae";

interface FileIconEntry {
	name: string;
	fileExtensions: string[];
	cloneBase?: string;
}

function ensureRepo(): void {
	if (existsSync(join(CACHE_DIR, ".git"))) {
		const r = spawnSync("git", ["-C", CACHE_DIR, "pull", "--ff-only"], {
			stdio: "inherit",
			encoding: "utf-8",
		});
		if (r.status !== 0) {
			console.warn("[material-icons] git pull failed; using cached tree");
		}
		return;
	}
	mkdirSync(join(process.cwd(), ".cache"), { recursive: true });
	const r = spawnSync(
		"git",
		["clone", "--depth", "1", REPO_URL, CACHE_DIR],
		{ stdio: "inherit", encoding: "utf-8" },
	);
	if (r.status !== 0) {
		throw new Error("[material-icons] git clone failed");
	}
}

function extractFileIconEntries(sourcePath: string): FileIconEntry[] {
	const source = readFileSync(sourcePath, "utf-8");
	const sf = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
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
							const key = ts.isIdentifier(pn)
								? pn.text
								: ts.isStringLiteral(pn)
									? pn.text
									: "";
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

function resolveSourceIconPath(
	iconName: string,
	cloneBase: string | undefined,
): string | null {
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

function writeDefaultFileSvg(): void {
	const svg = `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="${FILE_SVG_PATH}" fill="${DEFAULT_FILE_COLOR}" /></svg>`;
	writeFileSync(join(OUT_ICONS, "file.svg"), svg, "utf-8");
}

function main(): void {
	ensureRepo();
	if (!existsSync(FILE_ICONS_TS)) {
		throw new Error("[material-icons] missing fileIcons.ts after clone");
	}

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

	mkdirSync(OUT_ICONS, { recursive: true });

	const documentFallback = join(ICONS_SRC, "document.svg");

	function materializeIcon(logical: string): void {
		if (logical === "file") {
			writeDefaultFileSvg();
			return;
		}
		const entry = entries.find((x) => x.name === logical);
		const src = resolveSourceIconPath(logical, entry?.cloneBase);
		const dest = join(OUT_ICONS, `${logical}.svg`);
		if (src) {
			copyFileSync(src, dest);
		} else if (existsSync(documentFallback)) {
			copyFileSync(documentFallback, dest);
		}
	}

	for (const logical of logicalNames) {
		materializeIcon(logical);
	}

	const extensionMap: Record<string, string> = {};
	for (const [ext, logical] of extToLogical.entries()) {
		extensionMap[ext] = logical;
	}

	writeFileSync(OUT_MAP, JSON.stringify(extensionMap), "utf-8");

	console.log(
		`[material-icons] wrote ${Object.keys(extensionMap).length} extension mappings and ${logicalNames.size} icon files under public/material-file-icons`,
	);
}

main();
