/**
 * Magic byte signatures for common file formats.
 * Each entry maps a MIME type to an array of possible magic byte signatures.
 * Each signature is a tuple of [offset, bytes, description].
 */
const MAGIC_BYTES: Record<string, Array<[number, number[], string]>> = {
  // Images
  "image/png": [
    [0, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], "PNG signature"]
  ],
  "image/jpeg": [
    [0, [0xFF, 0xD8, 0xFF], "JPEG signature"]
  ],
  "image/gif": [
    [0, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], "GIF89a"],
    [0, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], "GIF87a"]
  ],
  "image/bmp": [
    [0, [0x42, 0x4D], "BMP signature"]
  ],
  "image/webp": [
    [0, [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50], "WebP RIFF header"]
  ],
  "image/tiff": [
    [0, [0x49, 0x49, 0x2A, 0x00], "TIFF little-endian"],
    [0, [0x4D, 0x4D, 0x00, 0x2A], "TIFF big-endian"]
  ],
  "image/x-icon": [
    [0, [0x00, 0x00, 0x01, 0x00], "ICO signature"]
  ],

  // Audio
  "audio/mpeg": [
    [0, [0x49, 0x44, 3], "MP3"],
    [0, [0xFF, 0xFB], "MP3 frame sync"],
    [0, [0xFF, 0xFA], "MP3 frame sync"]
  ],
  "audio/wav": [
    [0, [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45], "WAV RIFF header"]
  ],
  "audio/ogg": [
    [0, [0x4F, 0x67, 0x67, 0x53], "OGG signature"]
  ],
  "audio/flac": [
    [0, [0x66, 0x4C, 0x61, 0x43], "FLAC signature"]
  ],

  // Video
  "video/mp4": [
    [4, [0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6F, 0x6D], "MP4 ISO base media file"],
    [4, [0x66, 0x74, 0x79, 0x70, 0x6D, 0x70, 0x34, 0x32], "MP4"]
  ],
  "video/webm": [
    [0, [0x1A, 0x45, 0xDF, 0xA3], "WebM EBML header"]
  ],
  "video/x-msvideo": [
    [0, [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x41, 0x56, 0x49, 0x20], "AVI RIFF header"]
  ],

  // Archives
  "application/zip": [
    [0, [0x50, 0x4B, 0x03, 0x04], "ZIP local file header"],
    [0, [0x50, 0x4B, 0x05, 0x06], "ZIP empty archive"],
    [0, [0x50, 0x4B, 0x07, 0x08], "ZIP spanned archive"]
  ],
  "application/x-gzip": [
    [0, [0x1F, 0x8B], "GZIP signature"]
  ],
  "application/x-tar": [
    [257, [0x75, 0x73, 0x74, 0x61, 0x72], "POSIX ustar tar"]
  ],
  "application/x-7z-compressed": [
    [0, [0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C], "7z signature"]
  ],
  "application/x-rar-compressed": [
    [0, [0x52, 0x61, 0x72, 0x21, 0x1A, 0x07], "RAR5"],
    [0, [0x52, 0x61, 0x72, 0x21, 0x1A, 0x00], "RAR4"]
  ],

  // Documents
  "application/pdf": [
    [0, [0x25, 0x50, 0x44, 0x46], "PDF signature"]
  ],
  "application/msword": [
    [0, [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1], "MS Office (OLE)"]
  ],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    [0, [0x50, 0x4B, 0x03, 0x04], "OOXML (DOCX) - ZIP based"]
  ],
  "application/vnd.ms-excel": [
    [0, [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1], "MS Excel (OLE)"]
  ],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
    [0, [0x50, 0x4B, 0x03, 0x04], "OOXML (XLSX) - ZIP based"]
  ],

  // Fonts
  "font/woff": [
    [0, [0x77, 0x4F, 0x46, 0x46], "WOFF signature"]
  ],
  "font/woff2": [
    [0, [0x77, 0x4F, 0x46, 0x32], "WOFF2 signature"]
  ],
  "font/ttf": [
    [0, [0x00, 0x01, 0x00, 0x00], "TrueType font"]
  ],
  "font/otf": [
    [0, [0x4F, 0x54, 0x54, 0x4F, 0x00], "OpenType font"]
  ],

  // Other
  "application/json": [
    [0, [0x7B], "JSON start (brace)"],
    [0, [0x5B], "JSON start (bracket)"]
  ],
  "text/xml": [
    [0, [0x3C, 0x3F, 0x78, 0x6D, 0x6C], "XML declaration"]
  ],
  "application/xml": [
    [0, [0x3C, 0x3F, 0x78, 0x6D, 0x6C], "XML declaration"]
  ],
  "application/octet-stream": [
    // Generic binary - no specific magic bytes
  ]
};

/**
 * Validate file content against expected MIME type using magic bytes.
 * @param bytes File content as Uint8Array
 * @param expectedMimeType Expected MIME type to validate against
 * @returns Validation result with details
 */
export interface ValidationResult {
  isValid: boolean;
  detectedMimeType?: string;
  detectedFormat?: string;
  message: string;
}

/**
 * Detect MIME type from file content using magic bytes.
 * @param bytes File content as Uint8Array
 * @returns Detected MIME type or undefined if unknown
 */
export function detectMimeType(bytes: Uint8Array): string | undefined {
  for (const [mimeType, signatures] of Object.entries(MAGIC_BYTES)) {
    // Skip entries without signatures (like application/octet-stream)
    if (signatures.length === 0) continue;
    
    for (const [offset, signature, _desc] of signatures) {
      if (bytes.length < offset + signature.length) continue;
      
      let matches = true;
      for (let i = 0; i < signature.length; i++) {
        if (bytes[offset + i] !== signature[i]) {
          matches = false;
          break;
        }
      }
      if (matches) {
        return mimeType;
      }
    }
  }
  
  // Check for text-based content
  if (isTextContent(bytes)) {
    return "text/plain";
  }
  
  return undefined;
}

/**
 * Check if content appears to be text.
 * @param bytes File content
 */
function isTextContent(bytes: Uint8Array): boolean {
  // Check first 512 bytes for text content
  const checkLength = Math.min(bytes.length, 512);
  let textChars = 0;
  let totalChecked = 0;
  
  for (let i = 0; i < checkLength; i++) {
    const byte = bytes[i];
    // Allow common ASCII printable characters and common control characters
    if ((byte >= 32 && byte <= 126) || byte === 9 || byte === 10 || byte === 13) {
      textChars++;
    }
    totalChecked++;
  }
  
  // If more than 80% looks like text, consider it text
  return totalChecked > 0 && (textChars / totalChecked) > 0.8;
}

/**
 * Validate file content matches declared MIME type.
 * @param bytes File content
 * @param expectedMimeType Declared/expected MIME type
 * @returns Validation result
 */
export function validateFileContent(bytes: Uint8Array, expectedMimeType: string): ValidationResult {
  // Normalize MIME type
  const normalizedExpected = expectedMimeType.toLowerCase().trim();
  
  // Detect actual MIME type
  const detectedMime = detectMimeType(bytes);
  
  if (!detectedMime) {
    // Could not detect - this could be a format we don't have magic bytes for
    // Check if the expected type is a text format or something we can't detect
    if (normalizedExpected.startsWith("text/") || 
        normalizedExpected === "application/json" ||
        normalizedExpected === "application/javascript") {
      return {
        isValid: true,
        message: "Content appears to be valid (text-based format)"
      };
    }
    
    return {
      isValid: true, // Allow conversion attempt
      message: "Could not detect file type from content, proceeding with declared type"
    };
  }
  
  const normalizedDetected = detectedMime.toLowerCase();
  
  // Check for exact match
  if (normalizedExpected === normalizedDetected) {
    return {
      isValid: true,
      detectedMimeType: detectedMime,
      message: "File content matches declared type"
    };
  }
  
  // Check for compatible types (e.g., different image subtypes)
  const expectedCategory = normalizedExpected.split("/")[0];
  const detectedCategory = normalizedDetected.split("/")[0];
  
  if (expectedCategory === detectedCategory) {
    // Same category (e.g., both images), allow with warning
    return {
      isValid: true,
      detectedMimeType: detectedMime,
      message: `File content appears to be ${detectedMime}, but declared as ${expectedMimeType}. Proceeding anyway as types are compatible.`
    };
  }
  
  // Mismatch - report error
  return {
    isValid: false,
    detectedMimeType: detectedMime,
    message: `File type mismatch: declared as "${expectedMimeType}" but content appears to be "${detectedMime}"`
  };
}
