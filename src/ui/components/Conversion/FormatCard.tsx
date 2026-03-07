import { Mode, ModeEnum } from "src/ui/ModeStore";
import { Icon } from "../Icon";

import "./FormatCard.css";

export type FormatType = {
    formatName: string
    fullName: string
    mime: string
    icon: string
    active?: boolean
}

interface FormatCardProps {
    formatType: FormatType
    id: string
    selected: boolean
    handler: string
    onSelect: (id: string) => void
}

export default function FormatCard(props: FormatCardProps) {
    const formatData: FormatType =
        "formatType" in props ? props.formatType : props;

    return (
        <button className={ `format-card ${props.selected ? "active" : ""}` } onClick={ () => props.onSelect(props.id) }>
            {/* Mobile Card Layout */ }
            <div className="card-mobile-header mobile-only">
                <div className="card-title-group">
                    <span className={ props.selected ? "badge" : "badge gray" }>
                        { formatData.formatName }
                    </span>
                    <h3>{ formatData.fullName }</h3>
                    <p className="mime-type">({ formatData.mime })</p>
                </div>
                <div className="card-icon-sm">
                    <Icon src={ formatData.icon } size={ 16 } />
                </div>
            </div>

            {/* Desktop Card Layout */ }
            <div className="card-desktop-content desktop-only">
                <div className="card-top">
                    <div className="card-icon-lg">
                        <Icon src={ formatData.icon } size={ 32 } />
                    </div>
                    <span className="badge">
                        { formatData.formatName }
                    </span>
                    {
                        (
                            Mode.value === ModeEnum.Advanced) && (<span className="badge gray">
                                { props.handler }
                            </span>
                        )
                    }
                </div>
                <h3>{ formatData.fullName }</h3>
                <p className="mime-type">({ formatData.mime })</p>
            </div>
        </button>
    );
}
