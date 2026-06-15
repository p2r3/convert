import { CurrentPage, Pages } from "src/ui/AppState";
import { SelectedFiles } from "src/main.new";

export function hasSameMimeType(files: File[]): boolean {
	return files.every((file) => file.type === files[0]?.type);
}

export function setSelectedFilesAndGoToConversion(files: File[]): void {
	SelectedFiles.value = files.reduce<Record<`${string}-${string}`, File>>((acc, file) => {
		acc[`${file.name}-${file.lastModified}`] = file;
		return acc;
	}, {});
	CurrentPage.value = Pages.Conversion;
}
