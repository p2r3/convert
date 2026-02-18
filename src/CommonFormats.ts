import { FormatDefinition } from "src/FormatHandler"

/**
 * Common format definitions which can be used to reduce boilerplate definitions
 */
const CommonFormats = {
    // images
    PNG: new FormatDefinition(
        "Portable Network Graphics",
        "png",
        "png",
        "image/png",
        "image"
    ),
    JPEG: new FormatDefinition(
        "Joint Photographic Experts Group JFIF",
        "jpeg",
        "jpg",
        "image/jpeg",
        "image"
    ),
    WEBP: new FormatDefinition(
        "WebP",
        "webp",
        "webp",
        "image/webp",
        "image"
    ),
    GIF: new FormatDefinition(
        "CompuServe Graphics Interchange Format (GIF)",
        "gif",
        "gif",
        "image/gif",
        ["image", "video"]
    ),
    SVG: new FormatDefinition(
        "Scalable Vector Graphics",
        "svg",
        "svg",
        "image/svg+xml",
        ["image", "vector", "document"]
    ),
    // texts
    JSON: new FormatDefinition(
        "JavaScript Object Notation",
        "json",
        "json",
        "application/json",
        "data"
    ),
    TEXT: new FormatDefinition(
        "Plain Text",
        "text",
        "txt",
        "text/plain",
        "text"
    ),
    HTML: new FormatDefinition(
        "Hypertext Markup Language",
        "html",
        "html",
        "text/html",
        ["document", "text"]
    ),
    MD: new FormatDefinition(
        "Markdown Document",
        "md",
        "md",
        "text/markdown",
        ["document", "text"]
    ),
    // audio
    MP3: new FormatDefinition(
        "MP3 Audio",
        "mp3",
        "mp3",
        "audio/mpeg",
        "audio"
    )
}

export default CommonFormats