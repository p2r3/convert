import { FormatDefinition } from "src/FormatHandler"

const Category = {
    DATA: "data",
    IMAGE: "image",
    VIDEO: "video",
    VECTOR: "vector",
    DOCUMENT: "document",
    TEXT: "text",
    AUDIO: "audio"
}

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
        Category.IMAGE
    ),
    JPEG: new FormatDefinition(
        "Joint Photographic Experts Group JFIF",
        "jpeg",
        "jpg",
        "image/jpeg",
        Category.IMAGE
    ),
    WEBP: new FormatDefinition(
        "WebP",
        "webp",
        "webp",
        "image/webp",
        Category.IMAGE
    ),
    GIF: new FormatDefinition(
        "CompuServe Graphics Interchange Format (GIF)",
        "gif",
        "gif",
        "image/gif",
        [Category.IMAGE, Category.VIDEO]
    ),
    SVG: new FormatDefinition(
        "Scalable Vector Graphics",
        "svg",
        "svg",
        "image/svg+xml",
        [Category.IMAGE, Category.VECTOR, Category.DOCUMENT]
    ),
    // texts
    JSON: new FormatDefinition(
        "JavaScript Object Notation",
        "json",
        "json",
        "application/json",
        Category.DATA
    ),
    XML: new FormatDefinition(
        "Extensible Markup Language",
        "xml",
        "xml",
        "application/xml",
        Category.DATA
    ),
    YML: new FormatDefinition(
        "YAML Ain't Markup Language",
        "yaml",
        "yml",
        "application/yaml",
        Category.DATA
    ),
    CSV: new FormatDefinition(
        "Comma Seperated Values",
        "csv",
        "csv",
        "text/csv",
        Category.DATA
    ),
    TEXT: new FormatDefinition(
        "Plain Text",
        "text",
        "txt",
        "text/plain",
        Category.TEXT
    ),
    HTML: new FormatDefinition(
        "Hypertext Markup Language",
        "html",
        "html",
        "text/html",
        [Category.DOCUMENT, Category.TEXT]
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
        Category.AUDIO
    )
}

export default CommonFormats