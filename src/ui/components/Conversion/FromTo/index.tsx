import { ArrowRight } from "lucide-preact";
import type { ConversionOption } from "src/main.new";
import FileIcon from "src/ui/components/FileIcon";
import "./index.css";

interface FromToProps {
	fromOption: ConversionOption | null;
	toOption: ConversionOption | null;
	fromCount: number;
	toCount: number;
	onClickFrom: () => void;
	onClickTo: () => void;
}

function ExtPill({
	option,
	placeholder,
	count,
	kind,
	onClick,
}: {
	option: ConversionOption | null;
	placeholder: boolean;
	count: number;
	kind: "input" | "output";
	onClick: () => void;
}) {
	const ext = option?.[0].extension?.toUpperCase();
	const mime = option?.[0].mime;
	const label = `${count} ${kind} format${count === 1 ? "" : "s"}`;

	return (
		<button
			type="button"
			className={`fromto-pill ${placeholder ? "is-placeholder" : ""}`}
			onClick={onClick}
			aria-label={placeholder ? label : `Selected ${kind} format: ${ext}`}
		>
			{placeholder ? (
				<span className="fromto-count">{label}</span>
			) : (
				<>
					<FileIcon
						extension={option?.[0].extension}
						mimeType={mime}
						category={option?.[0].category}
						size={22}
					/>
					<span className="fromto-ext">.{ext}</span>
				</>
			)}
		</button>
	);
}

export default function FromTo({ fromOption, toOption, fromCount, toCount, onClickFrom, onClickTo }: FromToProps) {
	return (
		<div className="fromto">
			<ExtPill option={fromOption} placeholder={!fromOption} count={fromCount} kind="input" onClick={onClickFrom} />
			<div className="fromto-arrow" aria-hidden="true">
				<ArrowRight size={30} />
			</div>
			<ExtPill option={toOption} placeholder={!toOption} count={toCount} kind="output" onClick={onClickTo} />
		</div>
	);
}

