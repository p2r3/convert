import logoImage from 'src/ui/img/logo.svg';
import { Icon } from "src/ui/components/Icon";
import DarkModeToggle from 'src/ui/components/DarkModeToggle';
import SelectedFileInfo from 'src/ui/components/Conversion/SelectedFileInfo';
import AdvancedModeToggle from 'src/ui/components/AdvancedModeToggle';

import "./index.css";

export default function ConversionHeader() {
    return (
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
                <AdvancedModeToggle compact={ true } />
                <DarkModeToggle />
            </div>
        </header>
    );
}
