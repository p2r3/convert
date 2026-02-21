import DarkModeToggle from '../components/DarkModeToggle';

import './Conversion.css'

import { Icon } from "../components/Icon.tsx";

import logoImage from '../img/logo.svg';
import faImageRegular from '../img/fa-image-regular-full.svg';
import faBoxArchiveSolid from '../img/fa-box-archive-solid-full.svg';
import faFileLinesRegular from '../img/fa-file-lines-regular-full.svg';
import faVideoSolid from '../img/fa-video-solid-full.svg';
import faMusicSolid from '../img/fa-music-solid-full.svg';
import faMagnifyingGlassSolid from '../img/fa-magnifying-glass-solid-full.svg';
import FormatCard, { type FormatType } from "../components/Conversion/FormatCard.tsx";
import SideNav, { type FormatCategory } from "../components/Conversion/SideNav.tsx";
import Footer from "../components/Footer.tsx";
import ConversionSettings from "../components/Conversion/ConversionSettings.tsx";
import SelectedFileInfo from "../components/Conversion/SelectedFileInfo.tsx";

interface ConversionPageProps {

}

export default function Conversion(props: ConversionPageProps | undefined) {
    const sidebarItems: FormatCategory[] = [
        { category: "Archive", icon: faBoxArchiveSolid },
        { category: "Image", icon: faImageRegular, active: true },
        { category: "Document", icon: faFileLinesRegular },
        { category: "Video", icon: faVideoSolid },
        { category: "Audio", icon: faMusicSolid },
        { category: "E-Book", icon: faFileLinesRegular },
    ]

    const formatCards: FormatType[] = [
        { format: "PNG", fullName: "Portable Network Graphics", mime: "image/png", icon: faImageRegular, active: true },
        { format: "JPG", fullName: "JPEG Image", mime: "image/jpeg", icon: faImageRegular },
        { format: "WEBP", fullName: "WebP Image", mime: "image/webp", icon: faImageRegular },
        { format: "GIF", fullName: "CompuServe GIF", mime: "image/gif", icon: faImageRegular },
        { format: "TIFF", fullName: "Tagged Image File", mime: "image/tiff", icon: faImageRegular },
        { format: "BMP", fullName: "Bitmap", mime: "image/bmp", icon: faImageRegular },
        { format: "SVG", fullName: "Scalable Vector Graphics", mime: "image/svg+xml", icon: faImageRegular },
        { format: "HEIC", fullName: "High Efficiency Image File", mime: "image/heic", icon: faImageRegular },
        { format: "RAW", fullName: "Raw Image Data", mime: "image/x-raw", icon: faImageRegular },
    ];

    return (
        <div className="conversion-body">
            <header className="conversion-header">
                <div className="header-left">
                    <Icon
                        src={ logoImage }
                        size={ 40 }
                        color="var(--primary)"
                    />
                    <h1 className="conversion-title">Convert to it!</h1>
                </div>

                <div className="header-right">
                    {/* Desktop File Info */ }
                    <SelectedFileInfo className="desktop-only" />
                    <DarkModeToggle />
                </div>
            </header>

            {/* Mobile File Info */ }
            <SelectedFileInfo className="mobile-only" />

            <main className="conversion-main">
                <div className="content-wrapper">
                    <SideNav items={ sidebarItems } />

                    {/* Center Browser */ }
                    <section className="format-browser">
                        <div className="search-container">
                            <div className="search-input-wrapper">
                                <Icon
                                    src={ faMagnifyingGlassSolid }
                                    className="icon"
                                    size={ 16 }
                                    color="var(--text-secondary)"
                                />
                                <input
                                    type="text"
                                    placeholder="Search for any format (e.g. PNG, MP4, WAV)..."
                                />
                            </div>
                        </div>

                        <div className="format-list-container scroller">
                            <div className="list-header desktop-only">
                                <h2>Common Formats</h2>
                                <span>Showing { formatCards.length } formats</span>
                            </div>

                            <div className="format-grid">
                                { formatCards.map((card, index) => (
                                    <FormatCard formatType={ card } />
                                )) }
                            </div>
                        </div>
                    </section>
                </div>

                {/* Right Settings Sidebar / Bottom Settings Accordion */ }
                <aside className="settings-sidebar">
                    <ConversionSettings />
                    <div className="spacer"></div>
                    <div className="action-footer">
                        <button className="btn-convert">Convert!</button>
                    </div>
                </aside>
            </main>
            <Footer />
        </div>
    );
}
