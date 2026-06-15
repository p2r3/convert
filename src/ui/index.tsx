import { render } from "preact";

import UploadPage from "./pages/Upload";
import ConversionPage from "./pages/Conversion";
import { initTheme } from "./ThemeStore";
import Popup from "./components/Popup";
import FullPageDropOverlay from "./components/FullPageDropOverlay";
import { initMode } from "./ModeStore";
import { CurrentPage, Pages } from "./AppState";
import "./components/StyledButton/index.css";
export { CurrentPage, LoadingToolsText, Pages, PopupData } from "./AppState";

console.log("Rendering UI");

function App() {
	return (
		<>
			{CurrentPage.value === Pages.Conversion && <ConversionPage />}
			{CurrentPage.value === Pages.Upload && <UploadPage />}
			<FullPageDropOverlay />
			<Popup />
		</>
	);
}

render(<App />, document.body);

initTheme();
initMode();
