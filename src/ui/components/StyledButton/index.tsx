export const enum ButtonVariant {
	Default = 'default',
	Primary = 'primary',
	Compact = 'compact',
	Icon = 'icon',
}

interface StyledButtonProps {
	className?: string;
	variant?: ButtonVariant;
	onClick?: (ev: preact.TargetedMouseEvent<HTMLButtonElement>) => void;
	title?: string;
	tabIndex?: number;
	disabled?: boolean;
	buttonRef?: preact.Ref<HTMLButtonElement>;
	children: preact.ComponentChildren;
}

import "./index.css";

export default function StyledButton({
	className,
	variant = ButtonVariant.Default,
	onClick,
	title,
	tabIndex,
	disabled = false,
	buttonRef,
	children
}: StyledButtonProps) {
	// Combine base class with variant and any additional classes
	const variantClass = variant === ButtonVariant.Default ? '' : variant;
	const combinedClassName = className
		? `styled-button ${variantClass} ${className}`
		: `styled-button ${variantClass}`.trim();

	return (
		<button
			ref={buttonRef}
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
