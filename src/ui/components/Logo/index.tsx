import { RefreshCcw } from "lucide-preact";
import "./index.css";

interface LogoProps {
	showName?: boolean;
	size?: number;
	onClick?: () => void;
	disabled?: boolean;
}

export default function Logo({ showName = false, size = 28, onClick, disabled = false }: LogoProps) {
	const inner = (
		<>
			<div className="logo-icon">
				<RefreshCcw size={size} strokeWidth={2.5} />
			</div>
			{showName && <span className="logo-name">Convert to it!</span>}
		</>
	);

	if (onClick) {
		return (
			<button
				type="button"
				className="logo"
				disabled={disabled}
				onClick={onClick}
				aria-label="Back to upload"
			>
				{inner}
			</button>
		);
	}

	return <div className="logo">{inner}</div>;
}
