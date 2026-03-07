import { h } from "preact";

type ButtonVariant = 'default' | 'primary' | 'compact' | 'icon';

interface StyledButtonProps {
	className?: string;
	variant?: ButtonVariant;
	onClick?: (ev: preact.TargetedMouseEvent<HTMLButtonElement>) => void;
	title?: string;
	tabIndex?: number;
	disabled?: boolean;
	children: preact.ComponentChildren;
}

import "./StyledButton.css";

export default function StyledButton({ 
	className, 
	variant = 'default',
	onClick, 
	title, 
	tabIndex, 
	disabled = false, 
	children 
}: StyledButtonProps) {
	// Combine base class with variant and any additional classes
	const variantClass = variant === 'default' ? '' : variant;
	const combinedClassName = className 
		? `styled-button ${variantClass} ${className}`
		: `styled-button ${variantClass}`.trim();

	return (
		<button
			className={combinedClassName}
			onClick={onClick}
			title={title}
			tabIndex={tabIndex}
			disabled={disabled}
		>
			{children}
		</button>
	);
}
