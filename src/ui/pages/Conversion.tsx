import faImageRegular from '../img/fa-image-regular-full.svg';
import faBoxArchiveSolid from '../img/fa-box-archive-solid-full.svg';
import faFileLinesRegular from '../img/fa-file-lines-regular-full.svg';
import faVideoSolid from '../img/fa-video-solid-full.svg';
import faMusicSolid from '../img/fa-music-solid-full.svg';

import './Conversion.css'

import { type FormatCategory } from "../components/Conversion/SideNav";
import Footer from "../components/Footer";
import ConversionSidebar from "../components/Conversion/ConversionSidebar";
import SelectedFileInfo from "../components/Conversion/SelectedFileInfo";
import ConversionHeader from "../components/Conversion/ConversionHeader";
import { ConversionOptions } from 'src/main.new';

import FormatExplorer, { type FormatTypeCard } from "../components/Conversion/FormatExplorer.tsx";
import { useState } from "preact/hooks";

interface ConversionPageProps {

}

const sidebarItems: FormatCategory[] = [ // Placeholder categories
    { id: "arc", category: "Archive", icon: faBoxArchiveSolid },
    { id: "img", category: "Image", icon: faImageRegular },
    { id: "doc", category: "Document", icon: faFileLinesRegular },
    { id: "vid", category: "Video", icon: faVideoSolid },
    { id: "aud", category: "Audio", icon: faMusicSolid },
    { id: "ebk", category: "E-Book", icon: faFileLinesRegular },
];

/**
 * ! remove, pass direct format instead
 * Maps all supported formats into UI format cards
 */
function getConversionFormats(): FormatTypeCard[] {
    if (ConversionOptions.size) {
        const formats: FormatTypeCard[] = [];
        for (const [format, handler] of ConversionOptions.entries()) {
            if (format.to || handler.supportAnyInput) formats.push({
                fullName: format.name, // e.g. "Scalable Vector Graphics"
                formatName: format.format, // e.g. "svg"
                handlerName: handler.name, // e.g. "svgTrace"
                mime: format.mime, // e.g. "image/svg+xml"
                id: `${format.name}-${handler.name}-${format.mime}`, // e.g. Scalable Vector Graphics-svgTrace-image/svg+xml
                icon: faImageRegular,
            })
        }
        console.debug("Conversion formats:", formats);
        return formats;
    } else throw new Error("Can't build format list! Failed to get global format list");
}

export default function Conversion({ }: ConversionPageProps) {
    const AvailableConversionFormats: FormatTypeCard[] = getConversionFormats();
    const [selectedFormat, setSelectedFormat] = useState<FormatTypeCard | null>(null);

    return (
        <div className="conversion-body">
            <ConversionHeader />

            {/* Mobile File Info */ }
            <SelectedFileInfo className="mobile-only" />

            <main className="conversion-main">
                <FormatExplorer categories={ sidebarItems } conversionFormats={ AvailableConversionFormats } onSelect={ setSelectedFormat } />

                {/* Right Settings Sidebar / Bottom Settings Accordion */ }
                <ConversionSidebar conversionData={ selectedFormat } />
            </main>
            <Footer visible={ false } />
        </div>
    );
}
