import { signal } from "@preact/signals"
import { Category } from "src/CommonFormats"

export type CategoryEnum = typeof Category[keyof typeof Category] | 'all'

export type FormatCategory = {
	id: CategoryEnum
	categoryText: string
	icon: string
}

/** The currently-selected category */
export const SelectedCategory = signal<CategoryEnum>('all');
