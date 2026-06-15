export const enum ButtonVariant {
	Default = 'default',
	Primary = 'primary',
	Secondary = 'secondary',
	Compact = 'compact',
	Ghost = 'ghost',
	Icon = 'icon',
}

export const enum ButtonSize {
	Small = 'sm',
	Medium = 'md',
	Large = 'lg',
}

interface StyledButtonProps {
	className?: string;
	variant?: ButtonVariant;
	size?: ButtonSize;
	onClick?: (ev: preact.TargetedMouseEvent<HTMLButtonElement>) => void;
	title?: string;
	tabIndex?: number;
	disabled?: boolean;
	loading?: boolean;
	buttonRef?: preact.Ref<HTMLButtonElement>;
	children: preact.ComponentChildren;
	icon?: preact.ComponentChildren;
}

import "./index.css";

export default function StyledButton({
	className = "",
	variant = ButtonVariant.Default,
	size = ButtonSize.Medium,
	onClick,
	title,
	tabIndex,
	disabled = false,
	loading = false,
	buttonRef,
	children,
	icon
}: Readonly<StyledButtonProps>) {
	const classes = [
		'styled-button',
		variant === ButtonVariant.Default ? '' : variant,
		size === ButtonSize.Medium ? '' : `size-${size}`,
		loading ? 'loading' : '',
		className
	].filter(Boolean).join(' ');

	return (
		<button
			ref={buttonRef}
			className={classes}
			onClick={onClick}
			title={title}
			tabIndex={tabIndex}
			disabled={disabled || loading}
			aria-busy={loading}
		>
			{loading && <span className="button-loader" aria-hidden="true" />}
			{icon && <span className="button-icon">{icon}</span>}
			<span className="button-content">{children}</span>
		</button>
	);
}
