import type { ConvertPathNode, FileData } from "src/FormatHandler";
import ConversionSettings from "./ConversionSettings";

interface ConversionSidebarComponentProps {
	conversionData: {
		files: FileData[], from: ConvertPathNode, to: ConvertPathNode
	}
}

export default function ConversionSidebar({ conversionData }: ConversionSidebarComponentProps) {
	const conversionHandler = (data: ConversionSidebarComponentProps['conversionData']) => {
		console.debug(data);
	}

	return (
		<aside className="settings-sidebar">
			<ConversionSettings />
			<div className="spacer"></div>
			<div className="action-footer">
				<button
					onClick={ () => conversionHandler }
					className="btn-convert"
				>Convert!</button>
			</div>
		</aside>
	);
}
