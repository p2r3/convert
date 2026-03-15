import { SelectedCategory, type CategoryEnum, type FormatCategory } from "src/ui/FormatCategories"
import { Icon } from "src/ui/components/Icon"

import "./index.css"
import { useState } from "preact/hooks"
import { useSignalEffect } from "@preact/signals"

interface SideNavProps {
    items: FormatCategory[]
    onSelect?: (id: string) => void
}

export default function SideNav({ items, onSelect }: SideNavProps) {
    const [selectedId, setSelectedId] = useState<CategoryEnum>(SelectedCategory.value)

    const handleItemClick = (id: CategoryEnum) => {
        SelectedCategory.value = id
    }

    // Listen to `SelectedCategory` changes
    useSignalEffect(() => {
        if (SelectedCategory.value) setSelectedId(SelectedCategory.value)
    })

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
                                onClick={ () => handleItemClick(category.id) }
                                className={ selectedId === category.id ? "active" : undefined }
                                role="button"
                                tabIndex={ 0 }
                                onKeyDown={ (e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        handleItemClick(category.id)
                                    }
                                } }
                            >
                                <Icon src={ category.icon } size={ 16 } />
                                { " " }
                                { category.categoryText }
                            </li>
                        ))
                    }
                </ul>
            </div>
        </aside>
    )
}
