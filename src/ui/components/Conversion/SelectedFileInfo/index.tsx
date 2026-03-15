import type { CSSProperties } from "preact";

import faImageRegular from "src/ui/img/fa-image-regular-full.svg";
import faXRegular from "src/ui/img/fa-x-solid-full.svg";

import { Icon } from "src/ui/components/Icon";

import "./index.css"
import { SelectedFiles } from "src/main.new";
import { useState } from "preact/hooks";
import { CurrentPage, Pages } from "src/ui";

interface SelectedFileInfoProps {
    className?: string
    style?: CSSProperties
}

interface FileInfoBadgeProps {
    filename: string
    timestamp: string
}

export default function SelectedFileInfo({ className = "", style = {} }: SelectedFileInfoProps) {

    function FileInfoBadge({ filename, timestamp }: FileInfoBadgeProps) {
        const [deleteHover, setDeleteHover] = useState<boolean>(false);

        /**
         * Remove a file entry from the SelectedFiles map by key
         *
         * Creates a new object that omits the given name and
         * re-assigns it back to the signal, ensuring proper
         * capture by Signals
         *
         * @param name Name of file
         * @param timestamp Timestamp of the file
         */
        const removeFile = (name: string, timestamp: string) => {
            const { [`${name}-${timestamp}` as const]: _, ...rest } = SelectedFiles.value;
            SelectedFiles.value = rest;
        }

        const handleMouseOver = () => {
            setDeleteHover(true);
        }

        const handleOnClick = () => {
            setDeleteHover(false);
            removeFile(filename, timestamp);
            if (Object.keys(SelectedFiles.value).length === 0) CurrentPage.value = Pages.Upload;
        }

        return (
            <div
                className={ `file-info-badge ${className}` }
                style={ style }
                onMouseOver={ handleMouseOver }
                onMouseOut={ () => setDeleteHover(false) }
                onClick={ handleOnClick }
            >
                <Icon
                    src={ deleteHover ? faXRegular : faImageRegular }
                    size={ 16 }
                    color="var(--text-secondary)"
                />
                <span className="file-name">{ filename }</span>
            </div>
        )
    }

    return (
        <div className={ `file-info-container ${className}` }>
            {
                Object.values(SelectedFiles.value).map(file =>
                    <FileInfoBadge filename={ file.name } timestamp={ file.lastModified.toString() } key={ `${file.name}-${file.lastModified}` } />
                )
            }
        </div>
    );
}
