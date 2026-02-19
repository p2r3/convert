import fs from "node:fs";
import path from "node:path";

const BASE_URL = "https://converttoit.com";
const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, "public");
const TODAY = new Date().toISOString().slice(0, 10);

const URL_PATTERNS = {
  format: "/format/{from}-to-{to}/",
  compare: "/compare/{format-a}-vs-{format-b}/"
};

const formatPages = [
  {
    slug: "png-to-jpg",
    from: "PNG",
    to: "JPG",
    cluster: "image-conversion",
    intent: "transactional",
    primaryKeyword: "convert png to jpg",
    secondaryKeywords: [
      "png to jpg converter",
      "change png into jpg",
      "make png file smaller"
    ],
    userGoal: "You need a lightweight image for websites, email attachments, or ad platforms that reject larger PNG files.",
    conversionTriggers: [
      "Reduce screenshot file size before uploading to CMS.",
      "Prepare product images for marketplaces with strict size limits.",
      "Speed up page load time with compressed JPG output."
    ],
    qualityChecklist: [
      "Set JPG quality between 80 and 90 for balanced clarity.",
      "Check text edges to avoid compression artifacts.",
      "Keep the original PNG when transparency is required.",
      "Rename output using descriptive image intent keywords."
    ],
    pitfalls: [
      "JPG removes alpha transparency.",
      "Repeated JPG saves degrade quality.",
      "Over-compression creates visible blocky noise."
    ],
    deepDive: [
      "PNG to JPG workflows are usually chosen for distribution speed, not archival quality. Teams should preserve the source PNG in a master bucket, then export one delivery JPG tuned for the exact channel constraints.",
      "When converting UI screenshots, text edges are the first place compression artifacts appear. A safer process is to test quality levels against 100% zoom before publishing to documentation or support portals.",
      "Transparency handling must be planned explicitly. If the PNG has alpha regions, pre-define the fallback background color that matches your brand system so exports remain consistent across assets.",
      "For web delivery, measure the delta between source and output size and track resulting page-weight reduction. This creates a repeatable policy for future image conversion decisions."
    ],
    uniquenessSignals: [
      "transparent background fallback workflow",
      "marketplace image size cap",
      "compress screenshot for cms upload",
      "jpg export quality slider guidance",
      "photo delivery via email attachment",
      "replace lossless png with lossy jpeg",
      "website hero image compression",
      "alpha channel removal planning",
      "before-after kb comparison",
      "png flattening strategy"
    ],
    faq: [
      {
        q: "Does PNG to JPG reduce file size?",
        a: "Usually yes. JPG is lossy and optimized for photo-like images, so files are typically smaller than PNG exports."
      },
      {
        q: "Will my transparent PNG stay transparent?",
        a: "No. JPG does not support transparency, so transparent areas become a solid background color."
      }
    ]
  },
  {
    slug: "jpg-to-png",
    from: "JPG",
    to: "PNG",
    cluster: "image-conversion",
    intent: "transactional",
    primaryKeyword: "convert jpg to png",
    secondaryKeywords: [
      "jpg to png converter",
      "turn jpeg into png",
      "save jpeg as png"
    ],
    userGoal: "You need predictable, lossless re-editing output for design tools, slides, or annotation workflows.",
    conversionTriggers: [
      "Add overlays and text labels without additional JPG recompression.",
      "Prepare assets for design tools that favor PNG layers.",
      "Standardize screenshot libraries into one format."
    ],
    qualityChecklist: [
      "Verify dimensions match the source JPG.",
      "Keep color profile consistent across export steps.",
      "Use PNG when you need repeated editing rounds.",
      "Store source and converted versions for audit trails."
    ],
    pitfalls: [
      "Converting JPG to PNG does not recover lost detail.",
      "PNG output can be larger than JPG.",
      "False transparency expectations are common."
    ],
    deepDive: [
      "JPG to PNG is typically a production-stability decision for iterative editing. Teams use PNG output to stop additional JPEG recompression during annotation, handoff, and review cycles.",
      "Although detail cannot be restored, converting to PNG can protect remaining quality from further generation loss when files are opened and re-exported multiple times by different tools.",
      "If the destination includes layered design systems or repeated markup passes, PNG provides a safer intermediate format. Keep the original JPG and record the workflow stage where PNG becomes mandatory.",
      "For governance, define when JPG remains acceptable for final delivery and when PNG must be used for collaboration. This avoids unnecessary storage growth while preserving edit reliability."
    ],
    uniquenessSignals: [
      "lossless re-editing pass",
      "design handoff png requirement",
      "annotation workflow stabilization",
      "repeat export without jpeg generation loss",
      "pixel-safe archival snapshot",
      "client review markup cycle",
      "jpeg artifact containment",
      "consistent screenshot library format",
      "color profile lock for deck assets",
      "poster print prep from jpg source"
    ],
    faq: [
      {
        q: "Is JPG to PNG conversion lossless?",
        a: "The PNG file itself is lossless, but any detail already lost in the original JPG cannot be restored."
      },
      {
        q: "When should I use PNG after converting from JPG?",
        a: "Use PNG when you plan further edits, annotations, or repeated exports where extra JPG recompression would hurt clarity."
      }
    ]
  },
  {
    slug: "webp-to-png",
    from: "WEBP",
    to: "PNG",
    cluster: "image-conversion",
    intent: "transactional",
    primaryKeyword: "convert webp to png",
    secondaryKeywords: [
      "webp to png converter",
      "open webp in photoshop",
      "webp compatibility converter"
    ],
    userGoal: "You need broad compatibility for tools or workflows that still reject WEBP inputs.",
    conversionTriggers: [
      "Open WEBP images in legacy design software.",
      "Upload assets to systems without WEBP support.",
      "Preserve image editing flexibility in PNG pipelines."
    ],
    qualityChecklist: [
      "Confirm decoded dimensions match the original WEBP.",
      "Check transparency rendering after conversion.",
      "Keep naming aligned with existing asset IDs.",
      "Validate output in your target app before publishing."
    ],
    pitfalls: [
      "Some WEBP files include metadata that may not transfer.",
      "PNG output can inflate storage use.",
      "Animation in WEBP is flattened if exported as static PNG."
    ],
    uniquenessSignals: [
      "legacy editor format bridge",
      "cms without webp ingest",
      "transparent logo fallback for old tooling",
      "decode webp for figma import",
      "compatibility-first asset export",
      "animation flattening warning",
      "design ops pipeline normalization",
      "older email builder image support",
      "cross-team attachment readability",
      "webp metadata portability check"
    ],
    faq: [
      {
        q: "Why convert WEBP to PNG?",
        a: "PNG is accepted by nearly every design, office, and CMS workflow, making it a safer compatibility format."
      },
      {
        q: "Will transparency survive WEBP to PNG?",
        a: "In most cases yes, as both formats can carry transparency for still images."
      }
    ]
  },
  {
    slug: "svg-to-png",
    from: "SVG",
    to: "PNG",
    cluster: "design-asset-conversion",
    intent: "transactional",
    primaryKeyword: "convert svg to png",
    secondaryKeywords: [
      "svg to png converter",
      "export vector to raster",
      "rasterize svg"
    ],
    userGoal: "You need a fixed-size raster output for channels that cannot render SVG directly.",
    conversionTriggers: [
      "Publish social graphics where SVG is unsupported.",
      "Embed logos into slide tools that rasterize imports.",
      "Prepare app-store screenshots and mockups."
    ],
    qualityChecklist: [
      "Choose export dimensions before conversion.",
      "Use at least 2x target display size for sharpness.",
      "Review font fallback if custom fonts are embedded.",
      "Test PNG against dark and light backgrounds."
    ],
    pitfalls: [
      "Raster exports lose infinite scaling.",
      "Small export dimensions can blur icons.",
      "Unsupported SVG filters may render differently."
    ],
    uniquenessSignals: [
      "vector-to-raster social banner",
      "icon crispness at 2x export",
      "svg filter fallback rendering",
      "slide deck import reliability",
      "brand logo dark mode check",
      "custom font embed caution",
      "app store screenshot prep",
      "raster lock for ad network",
      "dpi-conscious export sizing",
      "vector source retention policy"
    ],
    faq: [
      {
        q: "What is the best size for SVG to PNG conversion?",
        a: "Export at least 2x your final display size to maintain crisp edges on high-density screens."
      },
      {
        q: "Can I keep SVG quality in PNG?",
        a: "PNG can look sharp, but it is still raster. You lose SVG's infinite scalability after export."
      }
    ]
  },
  {
    slug: "pdf-to-jpg",
    from: "PDF",
    to: "JPG",
    cluster: "document-conversion",
    intent: "transactional",
    primaryKeyword: "convert pdf to jpg",
    secondaryKeywords: [
      "pdf page to image",
      "pdf to jpg converter",
      "extract jpg from pdf page"
    ],
    userGoal: "You need shareable page snapshots for chats, docs, slides, or lightweight previews.",
    conversionTriggers: [
      "Share specific report pages in messaging apps.",
      "Insert PDF content into presentation tools.",
      "Create visual thumbnails for resource libraries."
    ],
    qualityChecklist: [
      "Select an export DPI that matches your display target.",
      "Verify text legibility after rasterization.",
      "Split multipage PDFs into clearly numbered outputs.",
      "Check color consistency in charts and diagrams."
    ],
    pitfalls: [
      "Low DPI exports can blur small text.",
      "Large PDFs may create many output files.",
      "Embedded fonts can render inconsistently at low resolution."
    ],
    uniquenessSignals: [
      "report page screenshot workflow",
      "presentation slide insertion from pdf",
      "thumbnail generation for asset library",
      "dpi tuning for text readability",
      "multi-page naming convention",
      "chart color fidelity check",
      "message app image sharing",
      "extract single page visuals",
      "invoice snapshot archiving",
      "pdf preview image pipeline"
    ],
    faq: [
      {
        q: "What DPI should I use for PDF to JPG?",
        a: "Use 150 DPI for quick previews and 300 DPI when you need clearer small text or print-friendly detail."
      },
      {
        q: "Can I convert one PDF page only?",
        a: "Yes. Select or export only the needed pages to keep output compact and easier to manage."
      }
    ]
  },
  {
    slug: "mov-to-mp4",
    from: "MOV",
    to: "MP4",
    cluster: "video-conversion",
    intent: "transactional",
    primaryKeyword: "convert mov to mp4",
    secondaryKeywords: [
      "mov to mp4 converter",
      "make mov playable everywhere",
      "apple mov to mp4"
    ],
    userGoal: "You need broader playback compatibility across web, Android, Windows, and social uploads.",
    conversionTriggers: [
      "Share iPhone footage with non-Apple teams.",
      "Upload clips to platforms that prefer MP4.",
      "Reduce player compatibility support tickets."
    ],
    qualityChecklist: [
      "Use H.264 video and AAC audio for compatibility.",
      "Match frame rate with the original capture.",
      "Check bitrate to balance size and quality.",
      "Review final playback on at least two devices."
    ],
    pitfalls: [
      "Bitrate set too low introduces visible artifacts.",
      "Variable frame rates can desync in some editors.",
      "Metadata may be reduced depending on codec path."
    ],
    uniquenessSignals: [
      "iphone footage cross-platform playback",
      "social media upload mp4 preference",
      "h264 aac compatibility baseline",
      "editor sync check for frame rate",
      "bitrate tuning for distribution",
      "android playback reliability",
      "windows default player support",
      "camera roll export normalization",
      "helpdesk ticket reduction via mp4",
      "streaming ingest readiness"
    ],
    faq: [
      {
        q: "Why is MP4 preferred over MOV for sharing?",
        a: "MP4 with H.264/AAC is widely supported across browsers, mobile devices, and social platforms."
      },
      {
        q: "Will MOV to MP4 reduce quality?",
        a: "Quality depends on bitrate and codec settings. Reasonable settings can preserve visual quality while improving compatibility."
      }
    ]
  },
  {
    slug: "wav-to-mp3",
    from: "WAV",
    to: "MP3",
    cluster: "audio-conversion",
    intent: "transactional",
    primaryKeyword: "convert wav to mp3",
    secondaryKeywords: [
      "wav to mp3 converter",
      "compress wav audio",
      "reduce audio file size"
    ],
    userGoal: "You need smaller audio files for upload limits, mobile sharing, or fast streaming starts.",
    conversionTriggers: [
      "Upload podcast drafts where WAV size is too large.",
      "Send interview clips over email or chat.",
      "Publish audio previews with low buffering risk."
    ],
    qualityChecklist: [
      "Use 192 kbps for balanced spoken-word quality.",
      "Choose 256-320 kbps for music-heavy tracks.",
      "Normalize loudness before final export.",
      "Listen for artifacts in quiet passages."
    ],
    pitfalls: [
      "Low bitrates can sound metallic.",
      "Re-encoding MP3 repeatedly compounds loss.",
      "Noise floors become more obvious after compression."
    ],
    uniquenessSignals: [
      "podcast upload size control",
      "spoken-word bitrate selection",
      "music preview streaming optimization",
      "email-friendly audio clip",
      "quiet passage artifact check",
      "interview sharing workflow",
      "loudness normalization pass",
      "mobile buffering reduction",
      "archival wav plus delivery mp3",
      "voice memo compression path"
    ],
    faq: [
      {
        q: "What bitrate is best for WAV to MP3?",
        a: "192 kbps works well for voice and mixed content; 256-320 kbps is better when music quality matters."
      },
      {
        q: "Should I keep the original WAV file?",
        a: "Yes. Keep WAV as the master and use MP3 only for distribution copies."
      }
    ]
  }
];

const comparePages = [
  {
    slug: "png-vs-jpg",
    a: "PNG",
    b: "JPG",
    cluster: "image-format-comparison",
    intent: "commercial",
    primaryKeyword: "png vs jpg",
    secondaryKeywords: ["png vs jpeg quality", "png or jpg for web", "png versus jpg size"],
    decisionSummary: "PNG prioritizes lossless clarity and transparency; JPG usually wins on file size for photo-heavy pages.",
    chooseA: [
      "UI screenshots with text overlays.",
      "Graphics that require transparency.",
      "Assets edited repeatedly before final export."
    ],
    chooseB: [
      "Photo galleries and blog cover images.",
      "Email-ready attachments with size limits.",
      "Large media libraries where storage cost matters."
    ],
    uniquenessSignals: [
      "lossless text edge preservation",
      "alpha channel requirement",
      "photographic compression economics",
      "web page weight budget",
      "transparent logo in design system",
      "camera image delivery format",
      "image seo speed tuning",
      "product card thumbnail strategy",
      "screenshot documentation clarity",
      "asset storage cost control"
    ],
    faq: [
      { q: "Is PNG always better quality than JPG?", a: "PNG is lossless, so it preserves sharp edges better, but JPG can look excellent for photos at practical quality settings." },
      { q: "Which format is better for website speed?", a: "JPG is usually smaller for photos, which helps speed. PNG can still be best for UI assets that need transparency." }
    ]
  },
  {
    slug: "jpg-vs-webp",
    a: "JPG",
    b: "WEBP",
    cluster: "image-format-comparison",
    intent: "commercial",
    primaryKeyword: "jpg vs webp",
    secondaryKeywords: ["webp vs jpeg", "webp for seo", "jpg webp compatibility"],
    decisionSummary: "WEBP typically delivers smaller files for similar visual quality, while JPG still wins on universal legacy compatibility.",
    chooseA: [
      "Older CMS plugins and legacy email editors.",
      "Workflows requiring guaranteed cross-platform display.",
      "Teams with JPG-only asset governance."
    ],
    chooseB: [
      "Modern websites optimizing Core Web Vitals.",
      "Image-heavy landing pages needing lower transfer size.",
      "Performance-focused mobile experiences."
    ],
    uniquenessSignals: [
      "modern browser compression advantage",
      "legacy cms jpeg fallback",
      "core web vitals image optimization",
      "cdn negotiation strategy",
      "lighthouse score uplift via webp",
      "email client rendering constraints",
      "progressive migration from jpg",
      "editor compatibility baseline",
      "mobile data savings pathway",
      "asset dual-format serving"
    ],
    faq: [
      { q: "Should I replace all JPG files with WEBP?", a: "Use WEBP where supported, but keep JPG fallbacks if your audience includes older tools and clients." },
      { q: "Does WEBP always look better?", a: "Not always better, but it often matches JPG quality at smaller file sizes when encoded well." }
    ]
  },
  {
    slug: "svg-vs-png",
    a: "SVG",
    b: "PNG",
    cluster: "design-format-comparison",
    intent: "commercial",
    primaryKeyword: "svg vs png",
    secondaryKeywords: ["svg or png logo", "vector vs raster image", "svg png difference"],
    decisionSummary: "SVG scales infinitely and is ideal for line art and logos; PNG is safer for fixed-size image compatibility.",
    chooseA: [
      "Responsive logos and icons.",
      "Design systems that require infinite scaling.",
      "Small assets where editable vector source matters."
    ],
    chooseB: [
      "Channels that do not render SVG reliably.",
      "Static social graphics and screenshots.",
      "Workflows requiring predictable pixel output."
    ],
    uniquenessSignals: [
      "infinite vector scaling behavior",
      "static raster social card output",
      "logo system source of truth",
      "line art sharpness retention",
      "pixel-grid export certainty",
      "svg render sandbox limitations",
      "email-safe image delivery",
      "icon font replacement strategy",
      "print and web dual workflow",
      "vector editing lifecycle"
    ],
    faq: [
      { q: "Is SVG better than PNG for logos?", a: "Usually yes for responsive web logos, because SVG stays sharp at any size and remains editable." },
      { q: "When should I use PNG instead of SVG?", a: "Use PNG when your target channel or software cannot reliably render SVG." }
    ]
  },
  {
    slug: "mov-vs-mp4",
    a: "MOV",
    b: "MP4",
    cluster: "video-format-comparison",
    intent: "commercial",
    primaryKeyword: "mov vs mp4",
    secondaryKeywords: ["mov or mp4", "mp4 compatibility", "mov file size"],
    decisionSummary: "MOV can retain Apple-centric editing workflows, while MP4 is the practical default for universal playback and distribution.",
    chooseA: [
      "Editing pipelines centered on Apple software.",
      "High-quality intermediate exports.",
      "Source retention before delivery encoding."
    ],
    chooseB: [
      "Web publishing and social uploads.",
      "Cross-device playback requirements.",
      "Smaller distribution-focused output files."
    ],
    uniquenessSignals: [
      "apple-first editing pipeline",
      "distribution codec normalization",
      "social platform ingest target",
      "cross-device playback matrix",
      "intermediate master export",
      "h264 and aac baseline",
      "camera original retention",
      "browser playback readiness",
      "team sharing outside apple ecosystem",
      "support ticket reduction from format mismatch"
    ],
    faq: [
      { q: "Is MOV higher quality than MP4?", a: "Quality depends on codec and bitrate. MOV often appears in pro workflows, but MP4 can match quality with compatible settings." },
      { q: "Which format is best for website video?", a: "MP4 is typically the safer choice for browser compatibility and delivery efficiency." }
    ]
  },
  {
    slug: "wav-vs-mp3",
    a: "WAV",
    b: "MP3",
    cluster: "audio-format-comparison",
    intent: "commercial",
    primaryKeyword: "wav vs mp3",
    secondaryKeywords: ["wav or mp3", "wav mp3 quality", "audio file size comparison"],
    decisionSummary: "WAV keeps full fidelity for production masters; MP3 is optimized for lightweight distribution and streaming.",
    chooseA: [
      "Studio mastering and archival storage.",
      "Sound design requiring uncompressed source.",
      "Post-production where repeated edits are expected."
    ],
    chooseB: [
      "Podcast publishing and mobile delivery.",
      "Preview clips for quick sharing.",
      "Bandwidth-sensitive audio playback."
    ],
    uniquenessSignals: [
      "master audio archival integrity",
      "distribution-friendly compressed delivery",
      "podcast hosting upload limits",
      "streaming startup latency",
      "post-production edit headroom",
      "metadata and tag portability",
      "voice content bitrate targeting",
      "music preview balance",
      "team review file exchange",
      "long-term restoration source"
    ],
    faq: [
      { q: "Should I publish podcasts in WAV or MP3?", a: "Most podcast workflows publish MP3 for size efficiency while retaining WAV masters offline." },
      { q: "Does MP3 always sound worse than WAV?", a: "MP3 is lossy, but at higher bitrates it can sound very close for everyday listening scenarios." }
    ]
  },
  {
    slug: "pdf-vs-docx",
    a: "PDF",
    b: "DOCX",
    cluster: "document-format-comparison",
    intent: "commercial",
    primaryKeyword: "pdf vs docx",
    secondaryKeywords: ["pdf or word document", "docx vs pdf for sharing", "editable vs fixed document"],
    decisionSummary: "PDF is best for fixed layout sharing; DOCX is better when collaborators need to edit and iterate.",
    chooseA: [
      "Final contracts, invoices, and reports.",
      "Print-ready files with locked formatting.",
      "External distribution where layout must not shift."
    ],
    chooseB: [
      "Collaborative drafting workflows.",
      "Teams using tracked changes and comments.",
      "Documents requiring frequent updates."
    ],
    uniquenessSignals: [
      "fixed layout legal document delivery",
      "collaborative tracked changes workflow",
      "print-ready pagination control",
      "final report sign-off format",
      "editable iteration cycles",
      "template-based word processing",
      "client approval handoff",
      "cross-organization compatibility choice",
      "archive vs draft lifecycle",
      "document governance policy"
    ],
    faq: [
      { q: "Which is better for signing and sharing: PDF or DOCX?", a: "PDF is usually better for signing and external sharing because it preserves layout consistently." },
      { q: "When should I keep DOCX instead of PDF?", a: "Keep DOCX while drafting or collaborating, then export PDF when the document is finalized." }
    ]
  }
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeText(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const BRAND = "ConvertToIt";
const OG_IMAGE = `${BASE_URL}/favicon.ico`;
const REDIRECT_SOURCE_HOSTS = [
  "https://converttoit.app",
  "http://converttoit.app",
  "https://www.converttoit.app",
  "http://www.converttoit.app"
];
const ENGLISH_STOP_WORDS = new Set([
  "a", "about", "after", "all", "also", "an", "and", "any", "are", "as", "at", "be", "before", "best", "but", "by",
  "can", "choose", "comparison", "convert", "converter", "converting", "for", "format", "from", "guide", "how", "if", "in", "into",
  "is", "it", "its", "more", "need", "of", "on", "or", "page", "pages", "that", "the", "this", "to", "use", "when", "with", "you", "your"
]);

function pageShell({
  title,
  description,
  canonicalPath,
  ogType = "article",
  body,
  jsonLd = [],
  ogImage = OG_IMAGE,
  ogImageAlt = `${BRAND} file conversion guide preview`
}) {
  const canonicalUrl = `${BASE_URL}${canonicalPath}`;
  const normalizedCanonical = canonicalUrl.endsWith("/") || canonicalUrl.endsWith(".html") ? canonicalUrl : `${canonicalUrl}/`;
  const jsonLdPayload = JSON.stringify({ "@context": "https://schema.org", "@graph": jsonLd }).replaceAll("<", "\\u003c");
  const ld = jsonLd.length ? `<script type="application/ld+json">${jsonLdPayload}</script>` : "";

  return `<!DOCTYPE html>
<html lang="en-US">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="${safeText(description)}">
  <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
  <title>${safeText(title)}</title>
  <link rel="canonical" href="${normalizedCanonical}">
  <link rel="alternate" hreflang="en" href="${normalizedCanonical}">
  <link rel="alternate" hreflang="x-default" href="${normalizedCanonical}">
  <meta property="og:type" content="${ogType}">
  <meta property="og:title" content="${safeText(title)}">
  <meta property="og:description" content="${safeText(description)}">
  <meta property="og:url" content="${normalizedCanonical}">
  <meta property="og:site_name" content="${BRAND}">
  <meta property="og:image" content="${safeText(ogImage)}">
  <meta property="og:image:alt" content="${safeText(ogImageAlt)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${safeText(title)}">
  <meta name="twitter:description" content="${safeText(description)}">
  <meta name="twitter:image" content="${safeText(ogImage)}">
  <meta name="twitter:image:alt" content="${safeText(ogImageAlt)}">
  <link rel="stylesheet" href="/pseo.css">
  ${ld}
</head>
<body>
  ${body}
</body>
</html>`;
}

function navBlock() {
  return `<nav class="top-nav" aria-label="Global navigation">
  <a href="${BASE_URL}/">Converter</a>
  <a href="${BASE_URL}/format/">Format guides</a>
  <a href="${BASE_URL}/compare/">Compare formats</a>
  <a href="${BASE_URL}/privacy.html">Privacy</a>
  <a href="${BASE_URL}/terms.html">Terms</a>
</nav>`;
}

function linkList(items) {
  return `<ul>${items.map((item) => `<li><a href="${item.href}">${safeText(item.label)}</a></li>`).join("")}</ul>`;
}

function textList(items) {
  return `<ul>${items.map((item) => `<li>${safeText(item)}</li>`).join("")}</ul>`;
}

function paragraphList(items) {
  return items.map((item) => `<p>${safeText(item)}</p>`).join("\n");
}

function formatFieldNotes(page) {
  return page.uniquenessSignals.map((signal, index) => {
    const stage = index % 3 === 0
      ? "before export"
      : index % 3 === 1
        ? "during conversion"
        : "after validation";

    return `Field note ${index + 1}: For ${signal}, teams converting ${page.from} to ${page.to} should document ${stage} checkpoints, keep a rollback copy of the original file, and confirm the output in the final destination workflow before publishing.`;
  });
}

function compareFieldNotes(page) {
  return page.uniquenessSignals.map((signal, index) => {
    const focus = index % 2 === 0 ? page.a : page.b;
    return `Decision note ${index + 1}: In ${signal}, prioritize ${focus} only when that choice directly supports your delivery constraints, stakeholder editing needs, and long-term storage policy without adding unnecessary re-encoding steps.`;
  });
}

function ensureLengthInRange(label, value, min, max) {
  const length = value.length;
  if (length < min || length > max) {
    throw new Error(`${label} length ${length} is outside ${min}-${max}: "${value}"`);
  }
}

function normalizeInternalPath(href) {
  if (!href) return "";
  if (href.startsWith(BASE_URL)) {
    return href.slice(BASE_URL.length);
  }
  return href;
}

function dedupeLinks(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = `${item.href}|${item.label}`.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

function withoutSelfLinks(items, canonicalPath) {
  const selfPath = canonicalPath.endsWith("/") ? canonicalPath : `${canonicalPath}/`;
  return items.filter((item) => {
    const normalized = normalizeInternalPath(item.href);
    return normalized !== selfPath && normalized !== selfPath.slice(0, -1);
  });
}

function formatTitle(page) {
  const title = `Convert ${page.from} to ${page.to} Online: Fast Quality Guide | ${BRAND}`;
  ensureLengthInRange(`Title for /format/${page.slug}/`, title, 50, 60);
  return title;
}

function formatDescription(page) {
  const description = `Convert ${page.from.toLowerCase()} to ${page.to.toLowerCase()} with a practical workflow, quality checklist, common pitfalls, and related links so you can publish smaller, compatible files faster today.`;
  ensureLengthInRange(`Meta description for /format/${page.slug}/`, description, 150, 160);
  return description;
}

function compareTitle(page) {
  const title = `${page.a} vs ${page.b}: Quality & Compatibility Guide | ${BRAND}`;
  ensureLengthInRange(`Title for /compare/${page.slug}/`, title, 50, 60);
  return title;
}

function compareDescription(page) {
  const description = `Compare ${page.a.toLowerCase()} vs ${page.b.toLowerCase()} with a practical checklist, use-case table, and conversion links so you can pick the right format for quality, size, and compatibility.`;
  ensureLengthInRange(`Meta description for /compare/${page.slug}/`, description, 150, 160);
  return description;
}

function htmlTextToWords(html) {
  const plain = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return plain.match(/[a-z0-9]+/g) ?? [];
}

function renderFormatHub(pages) {
  const title = "Format Conversion Guides by File Pair | ConvertToIt";
  const description = "Browse conversion guides by file pair. Use clean /format/* URLs to find practical conversion checklists and related format comparisons.";
  const body = `
<main class="page-wrap">
  ${navBlock()}
  <header>
    <p class="eyebrow">Template family: /format/*</p>
    <h1>Format Conversion Guides</h1>
    <p>Pick a conversion intent and jump to a URL-specific guide. Every guide has a unique primary keyword to reduce cannibalization.</p>
  </header>
  <section>
    <h2>Popular conversion intents</h2>
    <div class="card-grid">
      ${pages.map((page) => `<article class="card"><h3><a href="${BASE_URL}/format/${page.slug}/">${safeText(page.from)} to ${safeText(page.to)}</a></h3><p>${safeText(page.userGoal)}</p></article>`).join("")}
    </div>
  </section>
  <section>
    <h2>Also compare formats</h2>
    <p>Not sure which format to pick first? Use <a href="${BASE_URL}/compare/">comparison pages</a> to decide before converting.</p>
  </section>
</main>`;

  const jsonLd = [
    {
      "@type": "CollectionPage",
      name: "Format Conversion Guides",
      url: `${BASE_URL}/format/`
    }
  ];

  return pageShell({ title, description, canonicalPath: "/format/", body, jsonLd, ogType: "website" });
}

function renderCompareHub(pages) {
  const title = "File Format Comparison Guides | ConvertToIt";
  const description = "Compare file formats with decision-focused /compare/* pages. Find format trade-offs, use-case picks, and next-step conversion links.";
  const body = `
<main class="page-wrap">
  ${navBlock()}
  <header>
    <p class="eyebrow">Template family: /compare/*</p>
    <h1>File Format Comparison Guides</h1>
    <p>Use these pages to choose the right format before you convert. Each page targets one comparison keyword.</p>
  </header>
  <section>
    <h2>Comparison intents</h2>
    <div class="card-grid">
      ${pages.map((page) => `<article class="card"><h3><a href="${BASE_URL}/compare/${page.slug}/">${safeText(page.a)} vs ${safeText(page.b)}</a></h3><p>${safeText(page.decisionSummary)}</p></article>`).join("")}
    </div>
  </section>
  <section>
    <h2>Need direct conversion paths?</h2>
    <p>Jump to <a href="${BASE_URL}/format/">format conversion pages</a> for step-by-step action checklists.</p>
  </section>
</main>`;

  const jsonLd = [
    {
      "@type": "CollectionPage",
      name: "File Format Comparison Guides",
      url: `${BASE_URL}/compare/`
    }
  ];

  return pageShell({ title, description, canonicalPath: "/compare/", body, jsonLd, ogType: "website" });
}

function renderFormatPage(page, allFormatPages, compareMap) {
  const canonicalPath = `/format/${page.slug}/`;
  const pageUrl = `${BASE_URL}${canonicalPath}`;
  const title = formatTitle(page);
  const description = formatDescription(page);
  const primaryKeyword = page.primaryKeyword.toLowerCase();
  const compareSlug = `${page.from.toLowerCase()}-vs-${page.to.toLowerCase()}`;
  const compareLink = compareMap.has(compareSlug)
    ? { href: `${BASE_URL}/compare/${compareSlug}/`, label: `${page.from} vs ${page.to} quality comparison` }
    : null;

  const relatedConversions = allFormatPages
    .filter((entry) => entry.slug !== page.slug && (entry.from === page.from || entry.to === page.to || entry.cluster === page.cluster))
    .slice(0, 3)
    .map((entry) => ({ href: `${BASE_URL}/format/${entry.slug}/`, label: `Convert ${entry.from} to ${entry.to}` }));

  const resourceLinks = dedupeLinks(withoutSelfLinks([
    { href: `${BASE_URL}/`, label: "Open the online converter" },
    { href: `${BASE_URL}/format/`, label: "Browse all format conversion guides" },
    { href: `${BASE_URL}/compare/`, label: "Review comparison guides before converting" },
    ...relatedConversions,
    ...(compareLink ? [compareLink] : [])
  ], canonicalPath));

  const faqList = page.faq.map((item) => `<details><summary>${safeText(item.q)}</summary><p>${safeText(item.a)}</p></details>`).join("");
  const snippetAnswer = `<p><strong>${safeText(primaryKeyword)}</strong> helps when you need a delivery-ready ${safeText(page.to)} file that balances compatibility and quality. Keep the original ${safeText(page.from)} as your master source, export one optimized output for publishing, and validate dimensions, compression, and metadata before sharing to avoid repeat conversion work.</p>`;
  const longFormNotes = formatFieldNotes(page);
  const keywordAngleNotes = page.secondaryKeywords.map((keyword, index) => (
    `Keyword angle ${index + 1}: Teams searching for "${keyword}" usually need a fast ${page.from} to ${page.to} workflow that can be repeated with the same quality settings, naming rules, and destination-specific validation checks.`
  ));
  const checklistNarrative = page.qualityChecklist.map((item, index) => (
    `Quality control ${index + 1}: ${item} This matters because production handoffs fail when teams skip pre-publish checks and only notice format issues after distribution.`
  ));
  const pitfallNarrative = page.pitfalls.map((item, index) => (
    `Pitfall pattern ${index + 1}: ${item} Mitigate this by running one representative sample through your full workflow, then documenting the exact setting profile used in successful output.`
  ));
  const deepDiveNarrative = (page.deepDive ?? []).map((item, index) => (
    `Direction-specific note ${index + 1}: ${item}`
  ));

  const body = `
<main class="page-wrap">
  ${navBlock()}
  <header>
    <p class="eyebrow">Intent: ${safeText(page.intent)} · Cluster: ${safeText(page.cluster)}</p>
    <h1>How to convert ${safeText(page.from)} to ${safeText(page.to)}</h1>
    <p><strong>${safeText(primaryKeyword)}</strong> is useful when you need practical delivery output with fewer quality surprises.</p>
    <p>${safeText(page.userGoal)}</p>
  </header>

  <section>
    <h2>What is ${safeText(primaryKeyword)} best for?</h2>
    ${snippetAnswer}
  </section>

  <section>
    <h2>When this conversion is useful</h2>
    ${textList(page.conversionTriggers)}
  </section>

  <section>
    <h2>How to execute ${safeText(primaryKeyword)} with fewer mistakes</h2>
    <ol>
      <li>Open the <a href="${BASE_URL}/">ConvertToIt browser converter</a> and upload your ${safeText(page.from)} source file.</li>
      <li>Select ${safeText(page.to)} output, then tune settings for your final destination channel and size constraints.</li>
      <li>Preview the exported file, compare quality against the source, and keep both versions for rollback safety.</li>
    </ol>
  </section>

  <section>
    <h2>Quality checklist before publishing</h2>
    ${textList(page.qualityChecklist)}
  </section>

  <section>
    <h2>Common pitfalls</h2>
    ${textList(page.pitfalls)}
  </section>

  <section>
    <h2>Advanced ${safeText(page.from)} to ${safeText(page.to)} execution notes</h2>
    ${paragraphList(checklistNarrative)}
    ${paragraphList(pitfallNarrative)}
  </section>

  <section>
    <h2>What teams learn after repeated ${safeText(primaryKeyword)} projects</h2>
    ${paragraphList(keywordAngleNotes)}
    ${paragraphList(longFormNotes)}
  </section>

  ${deepDiveNarrative.length > 0 ? `
  <section>
    <h2>${safeText(page.from)} to ${safeText(page.to)} direction-specific engineering notes</h2>
    ${paragraphList(deepDiveNarrative)}
  </section>` : ""}

  <section>
    <h2>Related conversion resources</h2>
    ${linkList(resourceLinks)}
  </section>

  <section>
    <h2>FAQ</h2>
    ${faqList}
  </section>
</main>`;

  const jsonLd = [
    {
      "@type": "WebPage",
      name: `Convert ${page.from} to ${page.to}`,
      url: pageUrl,
      description
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${BASE_URL}/` },
        { "@type": "ListItem", position: 2, name: "Format Guides", item: `${BASE_URL}/format/` },
        { "@type": "ListItem", position: 3, name: `${page.from} to ${page.to}`, item: pageUrl }
      ]
    },
    {
      "@type": "FAQPage",
      mainEntity: page.faq.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a }
      }))
    }
  ];

  return {
    family: "format",
    slug: page.slug,
    url: canonicalPath,
    cluster: page.cluster,
    intent: page.intent,
    primaryKeyword,
    secondaryKeywords: page.secondaryKeywords,
    uniquenessSignals: page.uniquenessSignals,
    renderedText: htmlTextToWords(body).join(" "),
    html: pageShell({ title, description, canonicalPath, body, jsonLd, ogImageAlt: `Preview card for ${page.from} to ${page.to} conversion guide` })
  };
}

function renderComparePage(page, formatMap, allComparePages) {
  const canonicalPath = `/compare/${page.slug}/`;
  const pageUrl = `${BASE_URL}${canonicalPath}`;
  const title = compareTitle(page);
  const description = compareDescription(page);
  const primaryKeyword = page.primaryKeyword.toLowerCase();
  const formatAtoB = `${page.a.toLowerCase()}-to-${page.b.toLowerCase()}`;
  const formatBtoA = `${page.b.toLowerCase()}-to-${page.a.toLowerCase()}`;

  const actionLinks = [];
  if (formatMap.has(formatAtoB)) actionLinks.push({ href: `${BASE_URL}/format/${formatAtoB}/`, label: `Convert ${page.a} to ${page.b}` });
  if (formatMap.has(formatBtoA)) actionLinks.push({ href: `${BASE_URL}/format/${formatBtoA}/`, label: `Convert ${page.b} to ${page.a}` });

  const relatedComparisons = allComparePages
    .filter((entry) => entry.slug !== page.slug && (entry.cluster === page.cluster || entry.a === page.a || entry.b === page.b))
    .slice(0, 3)
    .map((entry) => ({ href: `${BASE_URL}/compare/${entry.slug}/`, label: `${entry.a} vs ${entry.b} comparison guide` }));

  const resourceLinks = dedupeLinks(withoutSelfLinks([
    { href: `${BASE_URL}/compare/`, label: "Browse all format comparison guides" },
    { href: `${BASE_URL}/format/`, label: "Open step-by-step conversion guides" },
    { href: `${BASE_URL}/`, label: "Test formats in the online converter" },
    ...actionLinks,
    ...relatedComparisons
  ], canonicalPath));

  const faqList = page.faq.map((item) => `<details><summary>${safeText(item.q)}</summary><p>${safeText(item.a)}</p></details>`).join("");
  const snippetAnswer = `<p><strong>${safeText(primaryKeyword)}</strong> is most useful when you need to balance quality, compatibility, and file size before publishing. Start from your destination channel requirements, confirm whether editing flexibility or playback reach matters more, then convert only once into the format that matches that decision.</p>`;
  const longFormNotes = compareFieldNotes(page);
  const keywordAngleNotes = page.secondaryKeywords.map((keyword, index) => (
    `Keyword angle ${index + 1}: Queries around "${keyword}" usually indicate buyers or operators evaluating long-term policy, not just one-off conversion output, so decision criteria should include edit lifecycle, storage cost, and distribution risk.`
  ));
  const chooseANarrative = page.chooseA.map((item, index) => (
    `${page.a} priority ${index + 1}: ${item} This route is strongest when your team needs predictable quality control and can accept any workflow overhead required by ${page.a}.`
  ));
  const chooseBNarrative = page.chooseB.map((item, index) => (
    `${page.b} priority ${index + 1}: ${item} This route is strongest when compatibility, transfer speed, or downstream publishing constraints are the dominant business requirement.`
  ));

  const body = `
<main class="page-wrap">
  ${navBlock()}
  <header>
    <p class="eyebrow">Intent: ${safeText(page.intent)} · Cluster: ${safeText(page.cluster)}</p>
    <h1>${safeText(page.a)} vs ${safeText(page.b)}</h1>
    <p><strong>${safeText(primaryKeyword)}</strong> should be your first check before choosing a conversion path.</p>
    <p>${safeText(page.decisionSummary)}</p>
  </header>

  <section>
    <h2>What is ${safeText(primaryKeyword)} best for?</h2>
    ${snippetAnswer}
  </section>

  <section>
    <h2>When ${safeText(page.a)} is the better choice</h2>
    ${textList(page.chooseA)}
  </section>

  <section>
    <h2>When ${safeText(page.b)} is the better choice</h2>
    ${textList(page.chooseB)}
  </section>

  <section>
    <h2>How to choose between ${safeText(page.a)} and ${safeText(page.b)}</h2>
    <ol>
      <li>Define whether your priority is edit flexibility, cross-device compatibility, or smaller transfer size.</li>
      <li>Match that priority to the table below, then test one representative file in your real publishing workflow.</li>
      <li>Lock a default format policy and document when the alternate format is still required.</li>
    </ol>
  </section>

  <section>
    <h2>Decision snapshot</h2>
    <table>
      <thead>
        <tr><th>Dimension</th><th>${safeText(page.a)}</th><th>${safeText(page.b)}</th></tr>
      </thead>
      <tbody>
        <tr><td>Best for</td><td>${safeText(page.chooseA[0])}</td><td>${safeText(page.chooseB[0])}</td></tr>
        <tr><td>Typical goal</td><td>${safeText(page.chooseA[1])}</td><td>${safeText(page.chooseB[1])}</td></tr>
        <tr><td>Operational focus</td><td>${safeText(page.chooseA[2])}</td><td>${safeText(page.chooseB[2])}</td></tr>
      </tbody>
    </table>
  </section>

  <section>
    <h2>Advanced decision guidance for ${safeText(page.a)} vs ${safeText(page.b)}</h2>
    ${paragraphList(chooseANarrative)}
    ${paragraphList(chooseBNarrative)}
  </section>

  <section>
    <h2>What teams learn after repeated ${safeText(primaryKeyword)} evaluations</h2>
    ${paragraphList(keywordAngleNotes)}
    ${paragraphList(longFormNotes)}
  </section>

  <section>
    <h2>Related decision resources</h2>
    ${linkList(resourceLinks)}
  </section>

  <section>
    <h2>FAQ</h2>
    ${faqList}
  </section>
</main>`;

  const jsonLd = [
    {
      "@type": "WebPage",
      name: `${page.a} vs ${page.b}`,
      url: pageUrl,
      description
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${BASE_URL}/` },
        { "@type": "ListItem", position: 2, name: "Compare Formats", item: `${BASE_URL}/compare/` },
        { "@type": "ListItem", position: 3, name: `${page.a} vs ${page.b}`, item: pageUrl }
      ]
    },
    {
      "@type": "FAQPage",
      mainEntity: page.faq.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a }
      }))
    }
  ];

  return {
    family: "compare",
    slug: page.slug,
    url: canonicalPath,
    cluster: page.cluster,
    intent: page.intent,
    primaryKeyword,
    secondaryKeywords: page.secondaryKeywords,
    uniquenessSignals: page.uniquenessSignals,
    renderedText: htmlTextToWords(body).join(" "),
    html: pageShell({ title, description, canonicalPath, body, jsonLd, ogImageAlt: `Preview card for ${page.a} vs ${page.b} format comparison guide` })
  };
}

function normalizeSignals(values) {
  return new Set(
    values
      .map((value) => value.toLowerCase().trim())
      .filter((value) => value.length > 0)
  );
}

function overlapScore(pageA, pageB) {
  const setA = normalizeSignals(pageA.uniquenessSignals);
  const setB = normalizeSignals(pageB.uniquenessSignals);
  const overlap = [...setA].filter((signal) => setB.has(signal)).length;
  const denominator = Math.max(setA.size, setB.size) || 1;
  return overlap / denominator;
}

function tokenizeForSimilarity(text) {
  return text
    .toLowerCase()
    .match(/[a-z0-9]+/g)
    ?.filter((word) => word.length > 2 && !ENGLISH_STOP_WORDS.has(word))
    ?? [];
}

function frequencyMap(tokens) {
  const counts = new Map();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
}

function cosineSimilarity(tokensA, tokensB) {
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  const mapA = frequencyMap(tokensA);
  const mapB = frequencyMap(tokensB);
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (const value of mapA.values()) normA += value * value;
  for (const value of mapB.values()) normB += value * value;
  for (const [token, valueA] of mapA.entries()) {
    const valueB = mapB.get(token) ?? 0;
    dot += valueA * valueB;
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function jaccardSimilarity(tokensA, tokensB) {
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  const intersection = [...setA].filter((token) => setB.has(token)).length;
  const union = new Set([...setA, ...setB]).size || 1;
  return intersection / union;
}

function renderedTextSimilarity(tokensA, tokensB) {
  const cosine = cosineSimilarity(tokensA, tokensB);
  const jaccard = jaccardSimilarity(tokensA, tokensB);
  return (cosine * 0.7) + (jaccard * 0.3);
}

function normalizeKeywordPhrase(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function collectKeywordPhrases(page) {
  return [
    normalizeKeywordPhrase(page.primaryKeyword),
    ...(Array.isArray(page.secondaryKeywords) ? page.secondaryKeywords.map((keyword) => normalizeKeywordPhrase(keyword)) : [])
  ].filter(Boolean);
}

function keywordOwnershipScore(page, keywordFrequency) {
  const phrases = collectKeywordPhrases(page);
  if (phrases.length === 0) return 0;
  const shared = phrases.filter((phrase) => (keywordFrequency.get(phrase) ?? 0) > 1).length;
  return 1 - (shared / phrases.length);
}

function urlPatternComplianceScore(page) {
  const path = page.url;
  const hasNoQuery = !path.includes("?") && !path.includes("#");
  const formatPattern = /^\/format\/[a-z0-9]+(?:-[a-z0-9]+)*-to-[a-z0-9]+(?:-[a-z0-9]+)*\/$/;
  const comparePattern = /^\/compare\/[a-z0-9]+(?:-[a-z0-9]+)*-vs-[a-z0-9]+(?:-[a-z0-9]+)*\/$/;
  const patternMatch = page.family === "format"
    ? formatPattern.test(path)
    : comparePattern.test(path);
  return hasNoQuery && patternMatch ? 1 : 0;
}

function buildUniquenessReport(allPages) {
  const pairwise = [];
  const pageStats = [];
  const tokenizedPages = allPages.map((page) => tokenizeForSimilarity(page.renderedText));
  const tokenDocumentFrequency = new Map();
  const keywordFrequency = new Map();

  for (const page of allPages) {
    const phrases = new Set(collectKeywordPhrases(page));
    for (const phrase of phrases) {
      keywordFrequency.set(phrase, (keywordFrequency.get(phrase) ?? 0) + 1);
    }
  }

  for (const tokens of tokenizedPages) {
    const unique = new Set(tokens);
    for (const token of unique) {
      tokenDocumentFrequency.set(token, (tokenDocumentFrequency.get(token) ?? 0) + 1);
    }
  }

  const highFrequencyCutoff = Math.ceil(allPages.length * 0.55);
  const filteredTokenPages = tokenizedPages.map((tokens) => tokens.filter((token) => (tokenDocumentFrequency.get(token) ?? 0) <= highFrequencyCutoff));

  const thresholds = {
    maxSignalOverlap: 0.2,
    maxRenderedTextSimilarity: 0.78,
    minMeaningfulUniquenessRaw: 0.51,
    minMeaningfulUniquenessStrategyScore: 80
  };
  const strategyWeights = {
    contentUniquenessFloor: 0.4,
    keywordOwnership: 0.25,
    signalIsolation: 0.2,
    urlPatternCompliance: 0.15
  };

  for (let i = 0; i < allPages.length; i += 1) {
    const uniquenessScores = [];
    let maxSignalOverlap = 0;
    let maxTextSimilarity = 0;

    for (let j = i + 1; j < allPages.length; j += 1) {
      const signalOverlap = overlapScore(allPages[i], allPages[j]);
      const textSimilarity = renderedTextSimilarity(filteredTokenPages[i], filteredTokenPages[j]);
      const overlap = Number(signalOverlap.toFixed(4));
      const rendered = Number(textSimilarity.toFixed(4));
      const combinedSimilarity = Number(((overlap * 0.35) + (rendered * 0.65)).toFixed(4));
      const meaningfulUniqueness = Number((1 - combinedSimilarity).toFixed(4));

      pairwise.push({
        pageA: allPages[i].url,
        pageB: allPages[j].url,
        overlap,
        renderedTextSimilarity: rendered,
        combinedSimilarity,
        meaningfulUniqueness
      });
      uniquenessScores.push(meaningfulUniqueness);
      maxSignalOverlap = Math.max(maxSignalOverlap, overlap);
      maxTextSimilarity = Math.max(maxTextSimilarity, rendered);
    }

    for (let k = 0; k < i; k += 1) {
      const existing = pairwise.find((item) => item.pageA === allPages[k].url && item.pageB === allPages[i].url);
      if (existing) {
        uniquenessScores.push(existing.meaningfulUniqueness);
        maxSignalOverlap = Math.max(maxSignalOverlap, existing.overlap);
        maxTextSimilarity = Math.max(maxTextSimilarity, existing.renderedTextSimilarity);
      }
    }

    const minUniqueness = uniquenessScores.length ? Math.min(...uniquenessScores) : 1;
    const keywordOwnership = keywordOwnershipScore(allPages[i], keywordFrequency);
    const signalIsolation = 1 - maxSignalOverlap;
    const urlPatternCompliance = urlPatternComplianceScore(allPages[i]);
    const meaningfulUniquenessStrategyScore = Number(((
      (minUniqueness * strategyWeights.contentUniquenessFloor)
      + (keywordOwnership * strategyWeights.keywordOwnership)
      + (signalIsolation * strategyWeights.signalIsolation)
      + (urlPatternCompliance * strategyWeights.urlPatternCompliance)
    ) * 100).toFixed(2));
    const pass =
      minUniqueness >= thresholds.minMeaningfulUniquenessRaw
      && maxSignalOverlap <= thresholds.maxSignalOverlap
      && maxTextSimilarity <= thresholds.maxRenderedTextSimilarity
      && meaningfulUniquenessStrategyScore >= thresholds.minMeaningfulUniquenessStrategyScore;

    pageStats.push({
      url: allPages[i].url,
      primaryKeyword: allPages[i].primaryKeyword,
      family: allPages[i].family,
      cluster: allPages[i].cluster,
      minMeaningfulUniqueness: Number(minUniqueness.toFixed(4)),
      meaningfulUniquenessStrategyScore,
      maxSignalOverlap: Number(maxSignalOverlap.toFixed(4)),
      maxRenderedTextSimilarity: Number(maxTextSimilarity.toFixed(4)),
      scoreBreakdown: {
        contentUniquenessFloor: Number((minUniqueness * 100).toFixed(2)),
        keywordOwnership: Number((keywordOwnership * 100).toFixed(2)),
        signalIsolation: Number((signalIsolation * 100).toFixed(2)),
        urlPatternCompliance: Number((urlPatternCompliance * 100).toFixed(2))
      },
      pass
    });
  }

  const strategyScores = pageStats.map((entry) => entry.meaningfulUniquenessStrategyScore);
  const minStrategyScore = Math.min(...strategyScores);
  const avgStrategyScore = Number((strategyScores.reduce((sum, score) => sum + score, 0) / strategyScores.length).toFixed(2));
  const rawUniqueness = pageStats.map((entry) => entry.minMeaningfulUniqueness);
  const minRawUniqueness = Number(Math.min(...rawUniqueness).toFixed(4));

  return {
    threshold: thresholds.minMeaningfulUniquenessRaw,
    thresholds: {
      ...thresholds,
      minMeaningfulUniqueness: thresholds.minMeaningfulUniquenessRaw
    },
    strategyFormula: {
      version: "meaningful-uniqueness-strategy-v2",
      target: `>= ${thresholds.minMeaningfulUniquenessStrategyScore}`,
      expression: "strategyScore = ((contentUniquenessFloor * 0.40) + (keywordOwnership * 0.25) + (signalIsolation * 0.20) + (urlPatternCompliance * 0.15)) * 100",
      components: {
        contentUniquenessFloor: "Lowest pairwise rendered-text uniqueness score for the page.",
        keywordOwnership: "Share of page keyword phrases that are not reused by other generated URLs.",
        signalIsolation: "1 - maximum synthetic uniqueness-signal overlap against any other page.",
        urlPatternCompliance: "1 when URL matches clean static family pattern (/format/* or /compare/*) with no query/hash."
      },
      weights: strategyWeights
    },
    summary: {
      pagesEvaluated: pageStats.length,
      minRawMeaningfulUniqueness: minRawUniqueness,
      minMeaningfulUniquenessStrategyScore: minStrategyScore,
      averageMeaningfulUniquenessStrategyScore: avgStrategyScore
    },
    strategy: [
      "One primary keyword per URL path.",
      "Self-referencing canonical on every pSEO page.",
      "No query-string indexable pages; only folder-based slugs.",
      "Rendered text similarity checks (cosine + Jaccard) run on generated page bodies.",
      "Synthetic uniqueness signals remain as a secondary overlap guardrail.",
      "Meaningful uniqueness strategy score blends raw text uniqueness with keyword ownership, signal isolation, and static URL-pattern compliance."
    ],
    pageStats,
    pairwise
  };
}

function buildKeywordIntentArtifact(formatEntries, compareEntries) {
  const toEntry = (page, family) => ({
    family,
    slug: page.slug,
    url: `/${family}/${page.slug}/`,
    primaryKeyword: page.primaryKeyword,
    secondaryKeywords: page.secondaryKeywords,
    intent: page.intent,
    cluster: page.cluster
  });

  const entries = [
    ...formatEntries.map((page) => toEntry(page, "format")),
    ...compareEntries.map((page) => toEntry(page, "compare"))
  ];

  const clusterMap = new Map();
  for (const entry of entries) {
    const key = `${entry.family}:${entry.cluster}`;
    if (!clusterMap.has(key)) {
      clusterMap.set(key, {
        family: entry.family,
        cluster: entry.cluster,
        intent: entry.intent,
        urlPattern: URL_PATTERNS[entry.family],
        urls: []
      });
    }
    clusterMap.get(key).urls.push(entry.url);
  }

  return {
    generatedAt: new Date().toISOString(),
    domain: BASE_URL,
    families: [
      {
        family: "format",
        urlPattern: URL_PATTERNS.format,
        intentModel: "transactional"
      },
      {
        family: "compare",
        urlPattern: URL_PATTERNS.compare,
        intentModel: "commercial"
      }
    ],
    entries,
    clusters: [...clusterMap.values()]
  };
}

function getMetaDescription(html) {
  return html.match(/<meta\s+name="description"\s+content="([^"]*)"/i)?.[1] ?? "";
}

function getTitle(html) {
  return html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? "";
}

function getCanonical(html) {
  return html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i)?.[1] ?? "";
}

function getBodyHtml(html) {
  return html.match(/<body>([\s\S]*?)<\/body>/i)?.[1] ?? html;
}

function collectLinks(htmlBody) {
  const links = [];
  const regex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of htmlBody.matchAll(regex)) {
    const label = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    links.push({ href: match[1], label });
  }
  return links;
}

function scoreSeoPage(page) {
  const html = page.html;
  const title = getTitle(html);
  const description = getMetaDescription(html);
  const canonical = getCanonical(html);
  const body = getBodyHtml(html);
  const words = htmlTextToWords(body);
  const first100 = words.slice(0, 100).join(" ");
  const keyword = page.primaryKeyword.toLowerCase();
  const h1Count = (body.match(/<h1\b[^>]*>/gi) ?? []).length;
  const h2Texts = [...body.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)].map((entry) => entry[1].replace(/<[^>]+>/g, " ").toLowerCase());
  const links = collectLinks(body).filter((entry) => entry.href.startsWith(BASE_URL) || entry.href.startsWith("/"));
  const bodyLinks = links.filter((entry) => !entry.href.includes("/privacy") && !entry.href.includes("/terms"));
  const selfLinks = bodyLinks.filter((entry) => normalizeInternalPath(entry.href) === page.url).length;
  const uniqueAnchorCount = new Set(bodyLinks.map((entry) => entry.label.toLowerCase())).size;
  const keywordCount = (words.join(" ").match(new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length;
  const density = (keywordCount / ((words.length || 1) / 1000));
  const quickSection = body.match(/<section>[\s\S]*?<h2>What is [\s\S]*?<\/h2>[\s\S]*?<p>([\s\S]*?)<\/p>/i)?.[1] ?? "";
  const quickWordCount = htmlTextToWords(quickSection).length;

  const breakdown = {
    title: 0,
    meta: 0,
    keywordPlacement: 0,
    snippets: 0,
    internalLinks: 0,
    technical: 0,
    social: 0,
    contentDepth: 0
  };

  if (title.length >= 50 && title.length <= 60) breakdown.title += 1;
  if (title.toLowerCase().includes(keyword)) breakdown.title += 1;
  if (title.includes(`| ${BRAND}`)) breakdown.title += 1;
  if (/guide|quality|compatibility/i.test(title)) breakdown.title += 1;

  if (description.length >= 150 && description.length <= 160) breakdown.meta += 1;
  if (/^(convert|compare|learn|discover)\s/i.test(description.toLowerCase())) breakdown.meta += 1;
  if (description.toLowerCase().includes(keyword)) breakdown.meta += 1;
  if (/checklist|pitfalls|table|links|compatibility|quality/i.test(description.toLowerCase())) breakdown.meta += 1;

  if (title.toLowerCase().includes(keyword)) breakdown.keywordPlacement += 1;
  if (description.toLowerCase().includes(keyword)) breakdown.keywordPlacement += 1;
  if (first100.includes(keyword)) breakdown.keywordPlacement += 1;
  if (h2Texts.some((item) => item.includes(keyword))) breakdown.keywordPlacement += 1;
  if (density > 0 && density <= 8) breakdown.keywordPlacement += 1;

  if (h2Texts.some((item) => /what is|how to|when/.test(item))) breakdown.snippets += 1;
  if (quickWordCount >= 40 && quickWordCount <= 60) breakdown.snippets += 1;
  if (/<ol>/i.test(body)) breakdown.snippets += 1;
  if (/<table>/i.test(body)) breakdown.snippets += 1;

  if (bodyLinks.length >= 3) breakdown.internalLinks += 1;
  if (uniqueAnchorCount >= 3) breakdown.internalLinks += 1;
  if (bodyLinks.some((entry) => entry.href.includes("/format/")) && bodyLinks.some((entry) => entry.href.includes("/compare/"))) breakdown.internalLinks += 1;
  if (selfLinks === 0) breakdown.internalLinks += 1;

  if (h1Count === 1) breakdown.technical += 1;
  if (page.url.includes(page.slug)) breakdown.technical += 1;
  if (canonical === `${BASE_URL}${page.url}`) breakdown.technical += 1;

  if (/<meta\s+property="og:image"/i.test(html)) breakdown.social += 1;
  if (/<meta\s+name="twitter:image"/i.test(html)) breakdown.social += 1;
  if (/<meta\s+name="twitter:card"\s+content="summary_large_image"/i.test(html)) breakdown.social += 1;

  if (/<details>/i.test(body)) breakdown.contentDepth += 1;
  if (words.length >= 800) breakdown.contentDepth += 1;
  if (/related conversion resources|related decision resources/i.test(body.toLowerCase())) breakdown.contentDepth += 1;

  const score = Object.values(breakdown).reduce((sum, value) => sum + value, 0);

  return {
    url: page.url,
    score,
    breakdown,
    titleLength: title.length,
    descriptionLength: description.length,
    keywordInFirst100Words: first100.includes(keyword),
    internalSelfLinkCount: selfLinks
  };
}

function buildSeoRubricReport(detailPages) {
  const pageScores = detailPages.map((page) => scoreSeoPage(page));
  const scores = pageScores.map((entry) => entry.score);
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const averageScore = Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(2));

  return {
    rubricVersion: "strict-seo-template-rubric-v1",
    maxScore: 30,
    targetMinimumScore: 24,
    summary: {
      pagesEvaluated: detailPages.length,
      averageScore,
      minScore,
      maxScore,
      passingPages: pageScores.filter((entry) => entry.score >= 24).length
    },
    pageScores
  };
}

function buildDomainPolicyArtifact() {
  return {
    canonicalDomain: BASE_URL,
    canonicalHost: "converttoit.com",
    redirectSourceHosts: REDIRECT_SOURCE_HOSTS,
    rules: [
      "Canonical and hreflang URLs must always use https://converttoit.com.",
      ".app hostnames are valid only as redirect sources into the canonical .com host.",
      "Sitemap and generated page metadata must not contain .app canonical targets."
    ],
    generatedAt: new Date().toISOString()
  };
}

function writeFile(relativePath, content) {
  const absPath = path.join(PUBLIC_DIR, relativePath);
  ensureDir(path.dirname(absPath));
  fs.writeFileSync(absPath, content, "utf8");
}

function buildSitemap(urls) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
  ];

  for (const url of urls) {
    lines.push("  <url>");
    lines.push(`    <loc>${BASE_URL}${url}</loc>`);
    lines.push(`    <lastmod>${TODAY}</lastmod>`);
    lines.push(`    <changefreq>${url === "/" ? "weekly" : "monthly"}</changefreq>`);
    lines.push(`    <priority>${url === "/" ? "1.0" : "0.7"}</priority>`);
    lines.push("  </url>");
  }

  lines.push("</urlset>");
  return `${lines.join("\n")}\n`;
}

function assertCanonicalDomainPolicy(pages, sitemap) {
  for (const page of pages) {
    if (/converttoit\.app/i.test(page.html)) {
      throw new Error(`Canonical policy violation: .app reference found in generated HTML for ${page.url}`);
    }
    const canonical = getCanonical(page.html);
    if (!canonical.startsWith(BASE_URL)) {
      throw new Error(`Canonical policy violation: non-.com canonical detected for ${page.url}`);
    }
  }

  if (/converttoit\.app/i.test(sitemap)) {
    throw new Error("Canonical policy violation: .app reference found in sitemap.");
  }
}

function main() {
  const formatMap = new Map(formatPages.map((page) => [page.slug, page]));
  const compareMap = new Map(comparePages.map((page) => [page.slug, page]));

  const generatedHtmlPages = [];
  const detailPages = [];

  const formatHub = renderFormatHub(formatPages);
  writeFile("format/index.html", formatHub);
  generatedHtmlPages.push({ url: "/format/", html: formatHub });

  const compareHub = renderCompareHub(comparePages);
  writeFile("compare/index.html", compareHub);
  generatedHtmlPages.push({ url: "/compare/", html: compareHub });

  for (const page of formatPages) {
    const rendered = renderFormatPage(page, formatPages, compareMap);
    writeFile(`format/${page.slug}/index.html`, rendered.html);
    generatedHtmlPages.push({ url: rendered.url, html: rendered.html });
    detailPages.push(rendered);
  }

  for (const page of comparePages) {
    const rendered = renderComparePage(page, formatMap, comparePages);
    writeFile(`compare/${page.slug}/index.html`, rendered.html);
    generatedHtmlPages.push({ url: rendered.url, html: rendered.html });
    detailPages.push(rendered);
  }

  const keywordIntent = buildKeywordIntentArtifact(formatPages, comparePages);
  writeFile("seo/keyword-intent-map.json", `${JSON.stringify(keywordIntent, null, 2)}\n`);

  const uniquenessInput = detailPages.map((page) => ({
    family: page.family,
    cluster: page.cluster,
    url: page.url,
    primaryKeyword: page.primaryKeyword,
    secondaryKeywords: page.secondaryKeywords,
    uniquenessSignals: page.uniquenessSignals,
    renderedText: page.renderedText
  }));
  const uniquenessReport = buildUniquenessReport(uniquenessInput);
  writeFile("seo/anti-cannibalization-report.json", `${JSON.stringify(uniquenessReport, null, 2)}\n`);

  const seoRubricReport = buildSeoRubricReport(detailPages);
  writeFile("seo/seo-rubric-report.json", `${JSON.stringify(seoRubricReport, null, 2)}\n`);

  const domainPolicy = buildDomainPolicyArtifact();
  writeFile("seo/domain-policy.json", `${JSON.stringify(domainPolicy, null, 2)}\n`);
  writeFile("seo/url-patterns.json", `${JSON.stringify({ domain: BASE_URL, patterns: URL_PATTERNS }, null, 2)}\n`);

  const sitemapUrls = [
    "/",
    "/privacy.html",
    "/terms.html",
    "/format/",
    "/compare/",
    ...formatPages.map((page) => `/format/${page.slug}/`),
    ...comparePages.map((page) => `/compare/${page.slug}/`)
  ];
  const sitemap = buildSitemap(sitemapUrls);
  writeFile("sitemap.xml", sitemap);

  assertCanonicalDomainPolicy(generatedHtmlPages, sitemap);

  const uniquenessFailed = uniquenessReport.pageStats.filter((entry) => !entry.pass);
  if (uniquenessFailed.length > 0) {
    throw new Error(`Anti-cannibalization thresholds failed for: ${uniquenessFailed.map((entry) => entry.url).join(", ")}`);
  }

  const seoFailed = seoRubricReport.pageScores.filter((entry) => entry.score < seoRubricReport.targetMinimumScore);
  if (seoFailed.length > 0) {
    throw new Error(`SEO rubric target failed for: ${seoFailed.map((entry) => `${entry.url} (${entry.score}/30)`).join(", ")}`);
  }

  console.log(`Generated ${formatPages.length} /format pages and ${comparePages.length} /compare pages.`);
  console.log(`Sitemap updated with ${sitemapUrls.length} URLs.`);
  console.log(`SEO rubric scores: min ${seoRubricReport.summary.minScore}/30, avg ${seoRubricReport.summary.averageScore}/30.`);
  console.log(`Meaningful uniqueness strategy: min ${uniquenessReport.summary.minMeaningfulUniquenessStrategyScore}, avg ${uniquenessReport.summary.averageMeaningfulUniquenessStrategyScore}.`);
  console.log(`All pages passed anti-cannibalization and canonical domain policy checks.`);
}

main();
