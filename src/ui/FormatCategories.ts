import { signal } from "@preact/signals"
import { Category } from "src/CommonFormats"
import type { ComponentType } from "preact"

export type CategoryEnum = typeof Category[keyof typeof Category] | 'all'

export type FormatCategory = {
	id: CategoryEnum
	categoryText: string
}

export const SelectedCategories = signal<Set<CategoryEnum>>(new Set());

export function toggleCategory(id: CategoryEnum) {
	const current = new Set(SelectedCategories.value);
	if (id === "all") {
		current.clear();
	} else if (current.has(id)) {
		current.delete(id);
	} else {
		current.add(id);
	}
	SelectedCategories.value = current;
}

export function clearCategories() {
	SelectedCategories.value = new Set();
}

export function hasActiveFilters(): boolean {
	return SelectedCategories.value.size > 0;
}
