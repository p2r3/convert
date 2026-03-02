import logoImage from '../../img/logo.svg';
import { Icon } from "../Icon";
import DarkModeToggle from '../DarkModeToggle';
import SelectedFileInfo from './SelectedFileInfo';

import "./ConversionHeader.css";

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
                <DarkModeToggle />
            </div>
        </header>
    );
}
