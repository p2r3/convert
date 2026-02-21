import { Icon } from "../Icon.tsx";
import { fromJsonHandler } from "../../../handlers/json.ts";

import "./SideNav.css"

export type FormatCategory = {
    category: string;
    icon: string;
    active?: boolean;
}

interface SideNavProps {
    items: FormatCategory[];
}

export default function SideNav({ items }: SideNavProps) {
    return (
        <aside className="side-nav">
            <div className="nav-header">
                <span>Format Category</span>
            </div>
            <div className="nav-list scroller">
                <ul>
                    { items.map((category, index) => (
                        <li key={ index }>
                            <a href="#" className={ category.active ? "active" : undefined }>
                                <Icon src={ category.icon } size={ 16 } />{ " " }
                                { category.category }
                            </a>
                        </li>
                    )) }
                </ul>
            </div>
        </aside>
    );
}
