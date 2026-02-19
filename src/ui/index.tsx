import { render } from "preact";
import { signal } from "@preact/signals";

import UploadPage from "./pages/Upload";
import ConversionPage from "./pages/Conversion";

console.log("Rendering UI");

export const enum Pages {
	Upload = "uploadPage",
	Conversion = "conversionPage"
}

export const CurrentPage = signal<Pages>(Pages.Upload);
export const UploadedFiles = signal<File[]>([]);

function App() {
	return (
		<>
			{ CurrentPage.value === Pages.Conversion && <ConversionPage /> }
			{ CurrentPage.value === Pages.Upload && <UploadPage /> }
		</>
	)
}

render(<App />, document.body);
