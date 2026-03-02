import faImageRegular from '../img/fa-image-regular-full.svg';
import faBoxArchiveSolid from '../img/fa-box-archive-solid-full.svg';
import faFileLinesRegular from '../img/fa-file-lines-regular-full.svg';
import faVideoSolid from '../img/fa-video-solid-full.svg';
import faMusicSolid from '../img/fa-music-solid-full.svg';

import './Conversion.css'

import { type FormatCategory } from "../components/Conversion/SideNav";
import Footer from "../components/Footer";
import ConversionSettings from "../components/Conversion/ConversionSettings";
import SelectedFileInfo from "../components/Conversion/SelectedFileInfo";
import ConversionHeader from "../components/Conversion/ConversionHeader";
import { AllOptions } from 'src/main.new';

import FormatExplorer, {type FormatTypeCard} from "../components/Conversion/FormatExplorer.tsx";
import {useState} from "preact/hooks";

interface ConversionPageProps {

}

const sidebarItems: FormatCategory[] = [ // Placeholder categories
    { id: "arc", category: "Archive", icon: faBoxArchiveSolid },
    { id: "img", category: "Image", icon: faImageRegular},
    { id: "doc", category: "Document", icon: faFileLinesRegular },
    { id: "vid", category: "Video", icon: faVideoSolid },
    { id: "aud", category: "Audio", icon: faMusicSolid },
    { id: "ebk", category: "E-Book", icon: faFileLinesRegular },
];

export default function Conversion(props: ConversionPageProps | undefined) {
    const AvailableConversionFormats: FormatTypeCard[] = getConversionFormats();
    const [selectedFormat, setSelectedFormat] = useState<FormatTypeCard | null>(null);

    /**
     * Maps all supported formats into UI format cards
     */
    function getConversionFormats(): FormatTypeCard[] {
        if (AllOptions) {
            return AllOptions.map((oldFormat) => ({
                format: oldFormat.format.format,
                fullName: oldFormat.format.name,
                icon: faImageRegular, // placeholder
                mime: oldFormat.format.mime,
                handlerName: oldFormat.handler.name,
                id: `${oldFormat.format.name}-${oldFormat.format.mime}-${oldFormat.handler.name}`
            }))
        } else throw new Error("Can't build format list! Failed to get global format list");
    }

    return (
        <div className="conversion-body">
            <ConversionHeader />

            {/* Mobile File Info */ }
            <SelectedFileInfo className="mobile-only" />

            <main className="conversion-main">
                <FormatExplorer categories={sidebarItems} conversionFormats={AvailableConversionFormats} onSelect={setSelectedFormat}/>

                {/* Right Settings Sidebar / Bottom Settings Accordion */ }
                <aside className="settings-sidebar">
                    <ConversionSettings />
                    <div className="spacer"></div>
                    <div className="action-footer">
                        <button className="btn-convert">Convert!</button>
                    </div>
                </aside>
            </main>
            <Footer visible={ false } />
        </div>
    );
}
