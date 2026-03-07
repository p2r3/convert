import type { CSSProperties } from "preact";
import './Icon.css'

type IconProps = {
    src: string
    size?: number | string
    color?: string
    className?: string
    style?: CSSProperties
};

export function Icon({
    src,
    size = 24,
    color,
    className = "",
    style = {},
}: IconProps) {

    const computedSize = typeof size === "number" ? `${size}px` : size;

    const maskStyles: CSSProperties = {
        ...(color ? { backgroundColor: color } : {}),

        maskImage: `url("${src}")`,
        WebkitMaskImage: `url("${src}")`,

        width: computedSize,
        height: computedSize,
        ...style,
    };

    return <div className={ `icon ${className}` } style={ maskStyles } />;
}
