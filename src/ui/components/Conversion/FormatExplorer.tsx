import { Icon } from "../Icon";
import FormatCard, { type FormatType } from "./FormatCard";
import SideNav, { type FormatCategory } from "./SideNav";
import faMagnifyingGlassSolid from '../../img/fa-magnifying-glass-solid-full.svg';
import { useDebouncedCallback } from 'use-debounce';

import './FormatExplorer.css';
import { useState } from "preact/hooks";

export type FormatTypeCard = FormatType & { id: string; handlerName: string }

type SearchProps = Set<keyof FormatType>;
/**
 * Search within these properties of the format cards
 */
const searchProps: SearchProps = new Set(['fullName', 'formatName', 'mime']);

interface FormatExplorerProps {
    categories: FormatCategory[];
    conversionFormats: FormatTypeCard[]
    onSelect?: (format: FormatTypeCard) => void;
    debounceWaitMs?: number;
}

export default function FormatExplorer({ categories, conversionFormats, onSelect, debounceWaitMs = 250 }: FormatExplorerProps) {
    const [formatCards, setFormatCards] = useState(conversionFormats);
    const [selectedFormatId, setSelectedFormatId] = useState<string | null>(null);

    /**
     * Filter available cards according to the search term and where to search for it
     * @param term The term to search
     * @param searchWhere Where to search
     */
    function filterFormats(term: string, searchWhere: SearchProps): FormatTypeCard[] {
        let filteredFormats: FormatTypeCard[] = [];
        conversionFormats.forEach((format) => {
            searchWhere.forEach((prop) => {
                if ((format[prop] as string).toLowerCase().includes(term)) filteredFormats.push(format);
            })
        })
        return filteredFormats;
    }

    /**
     * Debounce handler for the search.
     * If the input is empty, return all formats
     */
    const handleDebounceSearch = useDebouncedCallback((searchTerm) => {
        if (searchTerm === "") {
            setFormatCards(conversionFormats)
        } else {
            const searchResults = filterFormats(searchTerm, searchProps);
            setFormatCards(searchResults)
            console.debug("Debounced", searchResults)
        }
    }, debounceWaitMs)

    const handleFormatSelection = (id: string, card: FormatTypeCard) => {
        setSelectedFormatId(id);
        onSelect?.(card);
    };

    return (
        <div className="format-explorer content-wrapper">
            <SideNav items={ categories } />

            {/* Center Browser */ }
            <section className="format-browser">
                <div className="search-container">
                    <div className="search-input-wrapper">
                        <Icon
                            src={ faMagnifyingGlassSolid }
                            className="icon"
                            size={ 16 }
                            color="var(--text-secondary)"
                        />
                        <input
                            type="text"
                            placeholder="Search for any format (e.g. PNG, MP4, WAV)..."
                            onInput={ (ev) => handleDebounceSearch(ev.currentTarget.value) }
                        />
                    </div>
                </div>

                <div className="format-list-container scroller">
                    <div className="list-header desktop-only">
                        {/* <h2>Common Formats</h2> */ }
                        <span>Showing { formatCards.length } formats</span>
                    </div>

                    <div className="format-grid">
                        {
                            formatCards.map((card, i) => (
                                <FormatCard
                                    selected={ card.id === selectedFormatId }
                                    onSelect={ (id) => handleFormatSelection(id, card) }
                                    formatType={ card }
                                    key={ card.id.concat(`-${i}`) }
                                    id={ card.id }
                                    handler={ card.handlerName }
                                />
                            ))
                        }
                    </div>
                </div>
            </section>
        </div>
    )
}
