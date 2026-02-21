import faWrenchSolid from '../../img/fa-wrench-solid-full.svg';
import faChevronDownSolid from '../../img/fa-chevron-down-solid-full.svg';
import faSlidersSolid from '../../img/fa-sliders-solid-full.svg';
import faLinkSolid from '../../img/fa-link-solid-full.svg';
import type { FormatCategory } from "./SideNav";
import { useState } from "preact/hooks";
import { Icon } from "../Icon.tsx";

import "./ConversionSettings.css"

interface ConversionSettingsProps {

}

export default function ConversionSettings(props: ConversionSettingsProps) {
    const [isSettingsExpanded, setIsSettingsExpanded] = useState(false);

    const toggleSettings = () => {
        setIsSettingsExpanded(!isSettingsExpanded);
    };

    return (
        <div className={ `conversion-settings ${isSettingsExpanded ? 'is-expanded' : ''}` }>
            <div className="mobile-settings-header mobile-only" onClick={ toggleSettings }>
                <h3>
                    <Icon
                        src={ faWrenchSolid }
                        size={ 16 }
                        color="var(--text-secondary)"
                    />{ " " }
                    Options
                </h3>
                <Icon
                    src={ faChevronDownSolid }
                    size={ 16 }
                    color="var(--text-secondary)"
                    className={ `chevron-icon ${isSettingsExpanded ? 'rotate' : ''}` }
                />
            </div>
            <div className="settings-header desktop-only">
                <h3>
                    <Icon
                        src={ faSlidersSolid }
                        size={ 16 }
                        color="var(--text-secondary)"
                    />{ " " }
                    Output Settings
                </h3>
            </div>

            <div className="collapsible-wrapper">
                <div className="settings-content scroller">
                    <div className="input-group">
                        <label className="group-label">Resolution</label>
                        <div className="dual-input">
                            <div className="input-wrapper floating-label">
                                <label>Width</label>
                                <input type="number" placeholder="Auto" />
                            </div>

                            <div className="link-icon-wrapper">
                                <Icon src={ faLinkSolid } size={ 14 } className="link-icon" />
                            </div>

                            <div className="input-wrapper floating-label">
                                <label>Height</label>
                                <input type="number" placeholder="Auto" />
                            </div>
                        </div>
                    </div>

                    <div className="divider">
                        <div className="line"></div>
                        <span className="divider-text">OR</span>
                        <div className="line"></div>
                    </div>

                    <div className="input-group">
                        <label className="group-label">Pixel Density</label>
                        <div className="input-wrapper unit-right">
                            <input type="text" defaultValue="96" />
                            <span className="unit">DPI</span>
                        </div>
                    </div>

                    <div className="divider">
                        <div className="line"></div>
                    </div>

                    <div className="input-group">
                        <label className="group-label">Color Profile</label>
                        <select className="full-select">
                            <option>sRGB (Web Safe)</option>
                            <option>Adobe RGB</option>
                            <option>CMYK (Print)</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
    )
}
