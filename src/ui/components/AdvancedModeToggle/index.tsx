import { Mode, ModeEnum, toggleMode } from "src/ui/ModeStore";
import { Wrench } from "lucide-preact";
import tippy from "tippy.js";
import "tippy.js/dist/tippy.css";
import { useEffect, useRef } from "preact/hooks";
import StyledButton, { ButtonVariant } from "src/ui/components/StyledButton";

interface AdvancedModeToggleProps {
	compact?: boolean;
}

export default function AdvancedModeToggle({ compact = true }: AdvancedModeToggleProps) {
	const btnRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		if (!btnRef.current) return;
		const instance = tippy(btnRef.current, {
			content: `Switch to ${Mode.value === ModeEnum.Advanced ? "Simple" : "Advanced"} mode`,
			placement: "bottom",
			delay: [300, 0],
		});
		return () => instance.destroy();
	}, [Mode.value]);

	const handleClick = () => {
		toggleMode();
	};

	const isAdvanced = Mode.value === ModeEnum.Advanced;

	return (
		<StyledButton
			buttonRef={btnRef}
			variant={compact ? ButtonVariant.Compact : ButtonVariant.Default}
			onClick={handleClick}
		>
			{compact ? (
				<Wrench size={18} />
			) : (
				<>
					<Wrench size={16} />
					{isAdvanced ? " Simple mode" : " Advanced mode"}
				</>
			)}
		</StyledButton>
	);
}
