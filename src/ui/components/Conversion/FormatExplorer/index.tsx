import FormatCard from "src/ui/components/Conversion/FormatCard";
import Chip from "src/ui/components/Chip";
import { Search, X } from "lucide-preact";
import {
	Image, Video, Music, Archive, FileText, Code,
	Type, BarChart3, Presentation, Database
} from "lucide-preact";
import { useDebouncedCallback } from "use-debounce";

import "./index.css";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { FileFormat } from "src/FormatHandler";
import type { ConversionOption, ConversionOptionsMap } from "src/main.new";
import { Mode, ModeEnum } from "src/ui/ModeStore";
import FromTo from "src/ui/components/Conversion/FromTo";
import {
	SelectedCategories,
	toggleCategory,
	clearCategories,
	hasActiveFilters,
	type CategoryEnum
} from "src/ui/FormatCategories";
import { Category } from "src/CommonFormats";

interface FormatExplorerProps {
	conversionOptions: ConversionOptionsMap;
	onSelect?: (format: ConversionOption | null) => void;
	debounceWaitMs?: number;
	filterDirection?: "from" | "to";
	fromOption?: ConversionOption | null;
	toOption?: ConversionOption | null;
	fromCount?: number;
	toCount?: number;
	onClickFrom?: () => void;
	onClickTo?: () => void;
}

type SearchIndex = Map<string, ConversionOption>;

function formatExplorerRowKey(file: FileFormat, handlerName: string): string {
	return [
		handlerName,
		file.internal,
		file.mime,
		file.format,
		file.extension,
		String(file.from),
		String(file.to),
		file.name,
	].join("\0");
}

function matchesFormatSearch(option: ConversionOption, termLower: string): boolean {
	if (termLower === "") return true;
	const [file, handler] = option;
	return (
		file.name.toLowerCase().includes(termLower)
		|| file.format.toLowerCase().includes(termLower)
		|| file.extension.toLowerCase().includes(termLower)
		|| file.mime.toLowerCase().includes(termLower)
		|| file.internal.toLowerCase().includes(termLower)
		|| handler.name.toLowerCase().includes(termLower)
	);
}

const CATEGORY_CHIPS: Array<{ id: CategoryEnum; label: string; icon: preact.ComponentChildren }> = [
	{ id: Category.IMAGE, label: "Image", icon: <Image size={14} /> },
	{ id: Category.VIDEO, label: "Video", icon: <Video size={14} /> },
	{ id: Category.AUDIO, label: "Audio", icon: <Music size={14} /> },
	{ id: Category.DOCUMENT, label: "Document", icon: <FileText size={14} /> },
	{ id: Category.ARCHIVE, label: "Archive", icon: <Archive size={14} /> },
	{ id: Category.TEXT, label: "Text", icon: <Type size={14} /> },
	{ id: Category.CODE, label: "Code", icon: <Code size={14} /> },
	{ id: Category.DATA, label: "Data", icon: <Database size={14} /> },
	{ id: Category.VECTOR, label: "Vector", icon: <Presentation size={14} /> },
	{ id: Category.SPREADSHEET, label: "Spreadsheet", icon: <BarChart3 size={14} /> },
	{ id: Category.FONT, label: "Font", icon: <Type size={14} /> },
];

function generateSearchIndex(optionsMap: ConversionOptionsMap, advancedMode: boolean, direction: "from" | "to"): SearchIndex {
	const index: SearchIndex = new Map();
	const seen = new Set<string>();

	for (const [file, handler] of optionsMap) {
		if (direction === "from" && !file.from) continue;
		if (direction === "to" && !file.to) continue;

		const dedupeKey = `${file.mime}|${file.format}`;
		const id = formatExplorerRowKey(file, handler.name);
		if (advancedMode) {
			index.set(id, [file, handler]);
		} else {
			if (!seen.has(dedupeKey)) {
				seen.add(dedupeKey);
				index.set(id, [file, handler]);
			}
		}
	}

	return index;
}

function filterByCategories(options: SearchIndex, categories: Set<CategoryEnum>): SearchIndex {
	if (categories.size === 0) return options;

	const filtered: SearchIndex = new Map();
	for (const [key, pair] of options) {
		const cat = pair[0].category;
		if (typeof cat === "string" && categories.has(cat as CategoryEnum)) {
			filtered.set(key, pair);
		} else if (Array.isArray(cat)) {
			for (const c of cat) {
				if (categories.has(c as CategoryEnum)) {
					filtered.set(key, pair);
					break;
				}
			}
		}
	}
	return filtered;
}

function filterByTerm(options: SearchIndex, term: string): SearchIndex {
	if (term === "") return options;
	const filtered: SearchIndex = new Map();
	const t = term.toLowerCase();
	for (const [key, pair] of options) {
		if (matchesFormatSearch(pair, t)) filtered.set(key, pair);
	}
	return filtered;
}

export default function FormatExplorer({
	conversionOptions,
	onSelect,
	debounceWaitMs = 200,
	filterDirection = "to",
	fromOption,
	toOption,
	fromCount,
	toCount,
	onClickFrom,
	onClickTo,
}: FormatExplorerProps) {
	const isAdvanced = Mode.value === ModeEnum.Advanced;

	const originalIndex = useMemo(
		() => generateSearchIndex(conversionOptions, isAdvanced, filterDirection),
		[conversionOptions, isAdvanced, filterDirection]
	);

	const [searchTerm, setSearchTerm] = useState("");
	const [searchInputValue, setSearchInputValue] = useState("");
	const searchInputRef = useRef<HTMLInputElement>(null);

	const activeCategories = SelectedCategories.value;

	const searchResultsIndex = useMemo(
		() => filterByTerm(filterByCategories(originalIndex, activeCategories), searchTerm.toLowerCase()),
		[originalIndex, searchTerm, activeCategories]
	);

	const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);

	const handleDebounceSearch = useDebouncedCallback((term: string) => {
		setSearchTerm(term);
	}, debounceWaitMs);

	const handleOptionSelection = (id: string, option: ConversionOption) => {
		if (id === selectedOptionId) {
			setSelectedOptionId(null);
			onSelect?.(null);
			return;
		}
		setSelectedOptionId(id);
		onSelect?.(option);
	};

	const handleClearFilters = () => {
		clearCategories();
		setSearchTerm("");
		setSearchInputValue("");
	};

	const noResults = searchResultsIndex.size === 0;
	const filtersActive = hasActiveFilters() || searchTerm !== "";

	useEffect(() => {
		setSelectedOptionId(null);
	}, [filterDirection]);

	return (
		<div className="format-explorer">
			<div className="format-browser">
				<div className="search-container">
					<FromTo
						fromOption={fromOption ?? null}
						toOption={toOption ?? null}
						fromCount={fromCount ?? 0}
						toCount={toCount ?? 0}
						onClickFrom={() => onClickFrom?.()}
						onClickTo={() => {
							onClickTo?.();
							requestAnimationFrame(() => searchInputRef.current?.focus());
						}}
					/>
					<div className="search-input-wrapper">
						<Search size={16} className="search-icon" />
						<input
							ref={searchInputRef}
							type="text"
							placeholder="Search formats..."
							value={searchInputValue}
							onInput={(ev) => {
								const val = ev.currentTarget.value;
								setSearchInputValue(val);
								handleDebounceSearch(val);
							}}
						/>
						{searchInputValue && (
							<button
								className="search-clear"
								onClick={() => { setSearchInputValue(""); setSearchTerm(""); }}
							>
								<X size={14} />
							</button>
						)}
					</div>

					<div className="chip-filters">
						{CATEGORY_CHIPS.map(chip => (
							<Chip
								key={chip.id}
								label={chip.label}
								icon={chip.icon}
								selected={activeCategories.has(chip.id)}
								onClick={() => toggleCategory(chip.id)}
							/>
						))}
					</div>
				</div>

				<div className="format-list-container scroller">
					<div className="list-header">
						<span>{searchResultsIndex.size} format{searchResultsIndex.size !== 1 ? "s" : ""}</span>
					</div>

					{noResults ? (
						<div className="no-results">
							<p>No formats found</p>
							{filtersActive && (
								<button className="clear-filters-btn" onClick={handleClearFilters}>
									Clear filters
								</button>
							)}
						</div>
					) : (
						<div className="format-grid">
							{Array.from(searchResultsIndex).map(([key, option]) => (
								<FormatCard
									selected={key === selectedOptionId}
									onSelect={(key) => handleOptionSelection(key, option)}
									conversionOption={option}
									id={key}
									key={key}
									advanced={isAdvanced}
								/>
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
