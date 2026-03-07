import { Mode, ModeEnum, ModeText, toggleMode } from "../ModeStore";
import StyledButton from "./StyledButton";

interface AdvancedModeToggleComponentProps {
	compact: boolean
}

export default function AdvancedModeToggle({ compact }: AdvancedModeToggleComponentProps) {
	const onAdvancedModeClick = (ev: preact.TargetedMouseEvent<HTMLButtonElement>) => {
		toggleMode();
	}

	return (
		<StyledButton
			variant={ compact ? 'compact' : 'default' }
			onClick={ onAdvancedModeClick }
			title={ `Switch to ${Mode.value === ModeEnum.Advanced ? ModeText.Simple : ModeText.Advanced}` }
		>
			{
				(compact)
					? Mode.value === ModeEnum.Advanced ? "S" : "A"
					: Mode.value === ModeEnum.Advanced ? ModeText.Simple : ModeText.Advanced
			}
		</StyledButton>
	)
}
