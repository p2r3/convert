import type { ConversionOption } from "src/main.new";
import { Mode, ModeEnum } from "src/ui/ModeStore";
import { Icon } from "src/ui/components/Icon";
import faImageRegularFull from "src/ui/img/fa-image-regular-full.svg";

import "./index.css";

interface FormatCardProps {
    conversionOption: ConversionOption
    id: string
    selected: boolean
    onSelect: (id: string) => void
}

export default function FormatCard({ conversionOption, id, selected, onSelect }: FormatCardProps) {

    return (
        <button className={ `format-card ${selected ? "active" : ""}` } onClick={ () => onSelect(id) }>
            {/* Mobile Card Layout */ }
            <div className="card-mobile-header mobile-only">
                <div className="card-title-group">
                    <span className={ selected ? "badge" : "badge gray" }>
                        { conversionOption[0].extension }
                    </span>
                    <h3>{ conversionOption[0].name }</h3>
                    <p className="mime-type">({ conversionOption[0].mime })</p>
                </div>
                <div className="card-icon-sm">
                    <Icon src={ faImageRegularFull } size={ 16 } />
                </div>
            </div>

            {/* Desktop Card Layout */ }
            <div className="card-desktop-content desktop-only">
                <div className="card-top">
                    <div className="card-icon-lg">
                        <Icon src={ faImageRegularFull } size={ 32 } />
                    </div>
                    <span className="badge">
                        { conversionOption[0].extension }
                    </span>
                    {
                        (
                            Mode.value === ModeEnum.Advanced) && (<span className="badge gray">
                                { conversionOption[1].name }
                            </span>
                        )
                    }
                </div>
                <h3>{ conversionOption[0].name }</h3>
                <p className="mime-type">({ conversionOption[0].mime })</p>
            </div>
        </button>
    );
}
