import FormatCard from "src/ui/components/Conversion/FormatCard";
import useFirstTabTarget from "src/ui/scripts/useFirstTabTarget";
import useTypeToSearch from "src/ui/scripts/useTypeToSearch";
import { hasModifier, moveFocus } from "src/ui/scripts/keyboard";
import Chip from "src/ui/components/Chip";
import { ChevronDown, Search, X } from "lucide-preact";
import {
  Braces,
  Image,
  Video,
  PenTool,
  FileText,
  Text,
  Music,
  Archive,
  Sheet,
  Presentation,
  Type,
  Code,
  Database,
  Box,
} from "lucide-preact";
import { useDebouncedCallback } from "use-debounce";

import "./index.css";
import { useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { popupOpen } from "src/ui/PopupStore";
import type { RefObject } from "preact";
import type { FileFormat } from "src/FormatHandler";
import type { ConversionOption, ConversionOptionsMap } from "src/main";
import { Mode, ModeEnum } from "src/ui/ModeStore";
import FromTo from "src/ui/components/Conversion/FromTo";
import {
  SelectedCategories,
  toggleCategory,
  clearCategories,
  hasActiveFilters,
} from "src/ui/FormatCategories";
import { Category, type CategoryType } from "src/Formats";

interface FormatExplorerProps {
  conversionOptions: ConversionOptionsMap;
  matchingFrom?: Set<FileFormat>;
  onAdvance?: (format: ConversionOption) => void;
  onBack?: () => void;
  onSelect?: (format: ConversionOption | null) => void;
  debounceWaitMs?: number;
  direction?: "from" | "to";
  fromOption?: ConversionOption | null;
  toOption?: ConversionOption | null;
  fromCount?: number;
  toCount?: number;
  onClickFrom?: () => void;
  onClickTo?: () => void;
  showAll?: boolean;
  onShowAll?: () => void;
  /** Other parts of the page where typing should also go to the search input. */
  searchScopeRef?: RefObject<HTMLElement | null>;
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
    file.name.toLowerCase().includes(termLower) ||
    file.format.toLowerCase().includes(termLower) ||
    file.extension.toLowerCase().includes(termLower) ||
    file.mime.toLowerCase().includes(termLower) ||
    file.internal.toLowerCase().includes(termLower) ||
    handler.name.toLowerCase().includes(termLower)
  );
}

const CATEGORY_CHIPS = {
  [Category.IMAGE]: { label: "Image", icon: <Image size={14} /> },
  [Category.VECTOR]: { label: "Vector", icon: <PenTool size={14} /> },
  [Category.VIDEO]: { label: "Video", icon: <Video size={14} /> },
  [Category.AUDIO]: { label: "Audio", icon: <Music size={14} /> },
  [Category.TEXT]: { label: "Text", icon: <Text size={14} /> },
  [Category.DATA]: { label: "Data", icon: <Braces size={14} /> },
  [Category.CODE]: { label: "Code", icon: <Code size={14} /> },
  [Category.DOCUMENT]: { label: "Document", icon: <FileText size={14} /> },
  [Category.SPREADSHEET]: { label: "Spreadsheet", icon: <Sheet size={14} /> },
  [Category.PRESENTATION]: { label: "Presentation", icon: <Presentation size={14} /> },
  [Category.ARCHIVE]: { label: "Archive", icon: <Archive size={14} /> },
  [Category.FONT]: { label: "Font", icon: <Type size={14} /> },
  [Category.MODEL]: { label: "3D Model", icon: <Box size={14} /> },
  [Category.DATABASE]: { label: "Database", icon: <Database size={14} /> },
} satisfies Record<CategoryType, { label: string; icon: preact.ComponentChildren }>;

function generateSearchIndex(
  optionsMap: ConversionOptionsMap,
  matchingFrom: Set<FileFormat> | undefined,
  showAll: boolean,
  advancedMode: boolean,
  direction: "from" | "to",
): SearchIndex {
  const index: SearchIndex = new Map();
  const seen = new Set<string>();

  for (const [file, handler] of optionsMap) {
    if (direction === "from" && !file.from) continue;
    if (direction === "to" && !file.to) continue;
    if (direction === "from" && !showAll && matchingFrom && !matchingFrom.has(file)) continue;

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

  if (direction === "from" && matchingFrom) {
    return new Map([
      ...[...index].filter(([, [format]]) => matchingFrom.has(format)),
      ...[...index].filter(([, [format]]) => !matchingFrom.has(format)),
    ]);
  } else {
    return index;
  }
}

function filterByCategories(options: SearchIndex, categories: Set<CategoryType>): SearchIndex {
  if (categories.size === 0) return options;

  const filtered: SearchIndex = new Map();
  for (const [key, pair] of options) {
    const cat = pair[0].category;
    if (typeof cat === "string" && categories.has(cat)) {
      filtered.set(key, pair);
    } else if (Array.isArray(cat)) {
      for (const c of cat) {
        if (categories.has(c)) {
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
  matchingFrom,
  onSelect,
  onAdvance,
  onBack,
  debounceWaitMs = 200,
  direction = "to",
  fromOption,
  toOption,
  fromCount,
  toCount,
  onClickFrom,
  onClickTo,
  showAll = false,
  onShowAll,
  searchScopeRef,
}: FormatExplorerProps) {
  const isAdvanced = Mode.value === ModeEnum.Advanced;

  const originalIndex = useMemo(
    () => generateSearchIndex(conversionOptions, matchingFrom, showAll, isAdvanced, direction),
    [conversionOptions, matchingFrom, showAll, isAdvanced, direction],
  );

  const [searchTerm, setSearchTerm] = useState("");
  const [searchInputValue, setSearchInputValue] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  useFirstTabTarget(searchInputRef);
  const previousDirection = useRef(direction);

  const rootRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [activeCard, setActiveCard] = useState<string | null>(null);
  const [activeChip, setActiveChip] = useState(0);
  const [categoriesExpanded, setCategoriesExpanded] = useState(false);
  const [focusGrid, setFocusGrid] = useState(false);

  const activeCategories = SelectedCategories.value;

  const searchResultsIndex = useMemo(
    () =>
      filterByTerm(filterByCategories(originalIndex, activeCategories), searchTerm.toLowerCase()),
    [originalIndex, searchTerm, activeCategories],
  );

  const selectedOption = direction === "from" ? fromOption : toOption;
  const selectedOptionId = selectedOption
    ? formatExplorerRowKey(selectedOption[0], selectedOption[1].name)
    : null;

  const handleDebounceSearch = useDebouncedCallback((term: string) => {
    setSearchTerm(term);
  }, debounceWaitMs);

  const resultKeys = [...searchResultsIndex.keys()];
  const tabStop =
    activeCard && searchResultsIndex.has(activeCard)
      ? activeCard
      : selectedOptionId && searchResultsIndex.has(selectedOptionId)
        ? selectedOptionId
        : resultKeys[0];

  const focusSearch = () => searchInputRef.current?.focus();
  const clearSearch = () => {
    handleDebounceSearch.cancel();
    setSearchInputValue("");
    setSearchTerm("");
  };

  useLayoutEffect(() => {
    if (previousDirection.current === direction) return;
    previousDirection.current = direction;
    setActiveCard(null);
    clearSearch();
    if (!popupOpen.peek()) focusSearch();
  }, [direction]);

  // Runs after the flushed search results render, focusing the grid's tab stop.
  useLayoutEffect(() => {
    if (!focusGrid) return;
    setFocusGrid(false);
    resultsRef.current
      ?.querySelector<HTMLButtonElement>(".format-card[tabindex='0'], .explorer-dialog-btn")
      ?.focus();
  }, [focusGrid]);

  useTypeToSearch({
    scopeRefs: searchScopeRef ? [rootRef, searchScopeRef] : [rootRef],
    inputRef: searchInputRef,
    value: searchInputValue,
    onType: (value) => {
      setSearchInputValue(value);
      handleDebounceSearch(value);
    },
    onEscape: () => {
      if (!searchInputValue) return onBack?.();
      clearSearch();
      focusSearch();
    },
  });

  const showAllFormats = () => {
    onShowAll?.();
    focusSearch();
  };

  const handleOptionSelection = (id: string, option: ConversionOption) => {
    if (id === selectedOptionId) {
      onSelect?.(null);
      return;
    }
    onSelect?.(option);
  };

  const handleClearFilters = () => {
    clearCategories();
    clearSearch();
    focusSearch();
  };

  const noResults = searchResultsIndex.size === 0;
  const filtersActive = hasActiveFilters() || searchTerm !== "";

  return (
    <div className="format-explorer" ref={rootRef}>
      <div className="format-browser">
        <div className="search-container">
          <FromTo
            fromOption={fromOption ?? null}
            toOption={toOption ?? null}
            fromCount={fromCount ?? 0}
            toCount={toCount ?? 0}
            direction={direction}
            onClickFrom={() => {
              onClickFrom?.();
              requestAnimationFrame(() => searchInputRef.current?.focus());
            }}
            onClickTo={() => {
              onClickTo?.();
              requestAnimationFrame(() => searchInputRef.current?.focus());
            }}
          />
          <div className="search-row">
            <div className="search-input-wrapper">
              <Search size={16} className="search-icon" />
              <input
                ref={searchInputRef}
                type="text"
                aria-label={`Search ${direction === "from" ? "input" : "output"} formats`}
                onKeyDown={(event) => {
                  if (hasModifier(event)) return;
                  if (event.key === "Enter" || event.key === "ArrowDown") {
                    event.preventDefault();
                    handleDebounceSearch.cancel();
                    setSearchTerm(searchInputValue);
                    setFocusGrid(true);
                  }
                }}
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
                  aria-label="Clear search"
                  onClick={() => {
                    clearSearch();
                    focusSearch();
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <button
              type="button"
              className="category-toggle"
              aria-label="Toggle categories"
              aria-expanded={categoriesExpanded}
              aria-controls={`category-filters-${direction}`}
              onClick={() => setCategoriesExpanded((expanded) => !expanded)}
            >
              <ChevronDown size={16} />
            </button>
          </div>
          <div
            id={`category-filters-${direction}`}
            className={`chip-filters${categoriesExpanded ? " is-expanded" : ""}`}
            role="group"
            aria-label="Filter by category"
            onKeyDown={(event) =>
              moveFocus(event, [...event.currentTarget.querySelectorAll("button")], { wrap: true })
            }
          >
            {Object.entries(CATEGORY_CHIPS).map(([id, { label, icon }], index) => (
              <Chip
                key={id}
                tabIndex={activeChip === index ? 0 : -1}
                onFocus={() => setActiveChip(index)}
                label={label}
                icon={icon}
                selected={activeCategories.has(id as CategoryType)}
                onClick={() => toggleCategory(id as CategoryType)}
              />
            ))}
          </div>
        </div>

        <div
          className="format-list-container scroller"
          ref={resultsRef}
          onKeyDown={(event) => {
            const buttons = [
              ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                ".format-card, .explorer-dialog-btn",
              ),
            ];
            const cards = buttons.filter((button) => button.classList.contains("format-card"));
            const onCard = cards.includes(event.target as HTMLButtonElement);
            // Count cards on the first rendered row, so this works for any layout.
            const columns = onCard
              ? Math.max(1, cards.filter((card) => card.offsetTop === cards[0].offsetTop).length)
              : 1;
            // Home/End stay within the cards; arrows can continue on to the buttons below.
            const items = onCard && (event.key === "Home" || event.key === "End") ? cards : buttons;
            moveFocus(event, items, { columns });
          }}
        >
          <div className="list-header">
            <span>
              {searchResultsIndex.size} format{searchResultsIndex.size !== 1 ? "s" : ""}
            </span>
          </div>

          {noResults ? (
            <div className="explorer-dialog">
              <p>No matching formats found</p>
              {filtersActive && (
                <button className="explorer-dialog-btn" onClick={handleClearFilters}>
                  Clear filters
                </button>
              )}
              {direction === "from" && !showAll && (
                <button className="explorer-dialog-btn" onClick={showAllFormats}>
                  Show all
                </button>
              )}
            </div>
          ) : (
            <div className="format-grid" role="listbox" aria-label="Formats">
              {Array.from(searchResultsIndex).map(([key, option]) => (
                <FormatCard
                  selected={key === selectedOptionId}
                  tabIndex={key === tabStop ? 0 : -1}
                  onFocus={() => setActiveCard(key)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" || hasModifier(event)) return;
                    event.preventDefault();
                    if (!event.repeat) onAdvance?.(option);
                  }}
                  onSelect={(key) => handleOptionSelection(key, option)}
                  conversionOption={option}
                  id={key}
                  key={key}
                  advanced={isAdvanced}
                />
              ))}
            </div>
          )}
          {!noResults && direction === "from" && !showAll && (
            <div className="explorer-dialog">
              <p>Didn't find what you were looking for?</p>
              <button className="explorer-dialog-btn" onClick={showAllFormats}>
                Show all
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
