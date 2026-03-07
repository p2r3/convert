import { Icon } from "../Icon";

import "./SideNav.css"
import {useState} from "preact/hooks";

export type FormatCategory = {
    id: string
    category: string
    icon: string
}

interface SideNavProps {
    items: FormatCategory[]
    onSelect?: (id: string) => void
}

export default function SideNav({ items, onSelect }: SideNavProps) {
    const [selectedId, setSelectedId] = useState<string | null>(items[0]?.id || null);

    const handleItemClick = (id: string) => {
        setSelectedId(id);
        onSelect?.(id);
    };

    return (
        <aside className="side-nav">
            <div className="nav-header">
                <span>Format Category</span>
            </div>
            <div className="nav-list scroller">
                <ul>
                    {
                        items.map((category) => (
                            <li
                                key={ category.id }
                                onClick={() => handleItemClick(category.id)}
                                className={ selectedId === category.id ? "active" : undefined }
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        handleItemClick(category.id);
                                    }
                                }}
                            >
                                <Icon src={ category.icon } size={ 16 } />
                                { " " }
                                { category.category }
                            </li>
                        ))
                    }
                </ul>
            </div>
        </aside>
    );
}
