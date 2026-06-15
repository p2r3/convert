import { Category } from "src/CommonFormats";

const CATEGORY_TO_ICON: Record<string, string> = {
	[Category.DATA]: "json",
	[Category.IMAGE]: "image",
	[Category.VIDEO]: "video",
	[Category.VECTOR]: "svg",
	[Category.DOCUMENT]: "document",
	[Category.TEXT]: "document",
	[Category.AUDIO]: "audio",
	[Category.ARCHIVE]: "zip",
	[Category.SPREADSHEET]: "table",
	[Category.PRESENTATION]: "powerpoint",
	[Category.FONT]: "font",
	[Category.CODE]: "javascript",
};

export function normalizeCategory(
	category?: string | string[],
): string | undefined {
	if (category === undefined) return undefined;
	return Array.isArray(category) ? category[0] : category;
}

export function getDefaultIconForCategory(
	category?: string | string[],
): string {
	const key = normalizeCategory(category);
	if (!key) return "file";
	return CATEGORY_TO_ICON[key] ?? "file";
}
