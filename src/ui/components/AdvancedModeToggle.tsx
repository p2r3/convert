import { Mode, ModeEnum, ModeText, toggleMode } from "../ModeStore";

interface AdvancedModeToggleComponentProps {
	compact: boolean
}

import "./AdvancedModeToggle.css";

export default function AdvancedModeToggle({ compact }: AdvancedModeToggleComponentProps) {
	const onAdvancedModeClick = (ev: preact.TargetedMouseEvent<HTMLButtonElement>) => {
		toggleMode();
	}

	return (
		<button
			className={ compact ? 'compact' : '' }
			onClick={ onAdvancedModeClick }
			title={ `Switch to ${Mode.value === ModeEnum.Advanced ? ModeText.Simple : ModeText.Advanced}` }
		>
			{
				(compact)
					? Mode.value === ModeEnum.Advanced ? "S" : "A"
					: Mode.value === ModeEnum.Advanced ? ModeText.Simple : ModeText.Advanced
			}
		</button>
	)
}
