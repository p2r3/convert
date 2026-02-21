import { Icon } from "../Icon.tsx";

import "./SelectedFileInfo.css"

import faImageRegular from "../../img/fa-image-regular-full.svg";
import type { CSSProperties } from "preact";

interface SelectedFileInfoProps {
    className?: string;
    style?: CSSProperties;
}

export default function SelectedFileInfo({ className = "", style = {} }: SelectedFileInfoProps) {
    return (
        <div className={ `file-info-badge ${className}` } style={ style }>
            <Icon
                src={ faImageRegular }
                size={ 16 }
                color="var(--text-secondary)"
            />
            <span className="file-name">some_image.svg</span>
            <select className="format-select">
                <option value="svg">SVG</option>
                <option value="png">PNG</option>
                <option value="webp">WEBP</option>
                <option value="jpeg">JPEG</option>
            </select>
            <span className="file-size">2.52 KB</span>
        </div>
    );
}
