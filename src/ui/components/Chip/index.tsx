import "./index.css";

interface ChipProps {
	label: string;
	icon?: preact.ComponentChildren;
	selected?: boolean;
	onClick?: () => void;
}

export default function Chip({ label, icon, selected = false, onClick }: ChipProps) {
	return (
		<button
			className={`chip ${selected ? "chip-active" : ""}`}
			onClick={onClick}
			type="button"
		>
			{icon && <span className="chip-icon">{icon}</span>}
			<span className="chip-label">{label}</span>
		</button>
	);
}
