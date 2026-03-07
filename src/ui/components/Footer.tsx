import githubImg from '../img/fa-github-brands-solid-full.svg'
import discordImg from '../img/fa-discord-brands-solid-full.svg'

import './Footer.css'

interface FooterComponentProps {
	visible?: boolean
}

export default function Footer({ visible = true }: FooterComponentProps) {
	return (
		<footer aria-hidden={ !visible }>
			<div class="footer-item footer-copyright">
				<span class="footer-link-text">&copy; 2026, p2r3</span>
			</div>
			<a href="https://github.com/p2r3/convert" class="footer-item">
				<img class="footer-link-img" src={ githubImg } alt="Source" />
				<span class="footer-link-text">Source</span>
			</a>
			<a href="https://p2r3.com/discord" class="footer-item">
				<img class="footer-link-img" src={ discordImg } alt="Discord" />
				<span class="footer-link-text">Discord</span>
			</a>
		</footer>
	)
}
