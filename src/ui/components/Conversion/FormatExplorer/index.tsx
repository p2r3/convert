import FormatCard from "src/ui/components/Conversion/FormatCard";
import Chip from "src/ui/components/Chip";
import { Search, X } from "lucide-preact";
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
import { useMemo, useRef, useState } from "preact/hooks";
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
  /** Shortcuts shown under the category chips. */
  tools?: preact.ComponentChildren;
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
  tools,
}: FormatExplorerProps) {
  const isAdvanced = Mode.value === ModeEnum.Advanced;

  const originalIndex = useMemo(
    () => generateSearchIndex(conversionOptions, matchingFrom, showAll, isAdvanced, direction),
    [conversionOptions, matchingFrom, showAll, isAdvanced, direction],
  );

  const [searchTerm, setSearchTerm] = useState("");
  const [searchInputValue, setSearchInputValue] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  const handleOptionSelection = (id: string, option: ConversionOption) => {
    if (id === selectedOptionId) {
      onSelect?.(null);
      return;
    }
    onSelect?.(option);
  };

  const handleClearFilters = () => {
    clearCategories();
    setSearchTerm("");
    setSearchInputValue("");
  };

  const noResults = searchResultsIndex.size === 0;
  const filtersActive = hasActiveFilters() || searchTerm !== "";

  return (
    <div className="format-explorer">
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
                onClick={() => {
                  setSearchInputValue("");
                  setSearchTerm("");
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="chip-filters">
            {Object.entries(CATEGORY_CHIPS).map(([id, { label, icon }]) => (
              <Chip
                key={id}
                label={label}
                icon={icon}
                selected={activeCategories.has(id as CategoryType)}
                onClick={() => toggleCategory(id as CategoryType)}
              />
            ))}
          </div>

          {tools && (
            <div className="chip-filters tool-shortcuts">
              <span>Tools</span>
              {tools}
            </div>
          )}
        </div>

        <div className="format-list-container scroller">
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
                <button className="explorer-dialog-btn" onClick={() => onShowAll?.()}>
                  Show all
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
          {!noResults && direction === "from" && !showAll && (
            <div className="explorer-dialog">
              <p>Didn't find what you were looking for?</p>
              <button className="explorer-dialog-btn" onClick={() => onShowAll?.()}>
                Show all
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
