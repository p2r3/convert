# LZH/LHA Handler

This handler implements LZH (Lempel-Ziv-Huffman) and LHA archive format support for the Universal File Converter.

## Features

- **Custom Implementation**: Pure TypeScript implementation without external dependencies
- **Archive Extraction**: Extracts files from LZH/LHA archives
- **Archive Creation**: Creates LZH/LHA archives from files
- **Format Conversion**: 
  - **From LZH/LHA**: Converts to ZIP, JSON, or extracts individual files
  - **To LZH/LHA**: Creates archives from ZIP files or any other input files
- **Multiple Compression Methods**: Supports various LZH compression methods:
  - `-lh0-`: Uncompressed (store only) - used for creating archives
  - `-lh1-`: LZSS with 4KB sliding dictionary
  - `-lh4-`: LZSS with 8KB dictionary and Huffman coding
  - `-lh5-`: LZSS with 8KB dictionary and Huffman coding  
  - `-lh6-`: LZSS with 32KB dictionary and Huffman coding
  - `-lh7-`: LZSS with 64KB dictionary and Huffman coding
  - `-lhd-`: Directory entry

## Format Information

### LHA/LZH Archive Format

LHA (formerly LHarc) is an archiving and compression utility developed by Haruyasu Yoshizaki. The format uses:

- **Header Structure**: Contains file metadata (name, size, timestamp, attributes)
- **Compression**: LZSS algorithm combined with adaptive Huffman coding
- **Multiple Levels**: Supports header levels 0, 1, and 2
- **CRC Checking**: Includes CRC-16 checksums for data integrity

### MIME Types

The handler normalizes the following MIME types:

- `application/x-lzh-compressed` (LZH)
- `application/x-lha` (LHA)
- `application/x-lharc` → `application/x-lzh-compressed`
- `application/lha` → `application/x-lha`
- `application/x-lzh` → `application/x-lzh-compressed`

## Implementation Details

### Decoder (`decoder.ts`)

The decoder implements:

1. **Header Parsing**: Reads LHA archive headers (levels 0-2)
2. **LZSS Decompression**: Sliding window dictionary-based decompression
3. **Huffman Decoding**: Adaptive Huffman tree decoding (simplified for common cases)
4. **Timestamp Conversion**: MS-DOS date/time to JavaScript Date
5. **Validation**: Checks header sizes, compression methods, and data boundaries

### Encoder (`encoder.ts`)

The encoder implements:

1. **Header Generation**: Creates level-0 LHA headers
2. **Store Method**: Uses `-lh0-` (uncompressed) for maximum compatibility
3. **CRC-16 Calculation**: Computes file checksums
4. **Timestamp Encoding**: JavaScript Date to MS-DOS date/time format
5. **Multi-file Archives**: Combines multiple files into a single archive

### Handler (`lzh.ts`)

The main handler provides:

- Archive extraction to individual files
- Conversion to ZIP format with preserved timestamps
- Conversion to JSON format with archive metadata including:
  - Archive name and file count
  - Total sizes (original and compressed)
  - Per-file information: filename, size, timestamp, compression method, CRC, compression ratio
  - Directory detection
- Error handling and graceful degradation
- Support for nested directories in archives

## Usage
  - ZIP archives (preserves all file data and timestamps)
  - JSON files (archive metadata and file listing)
  - Extracted individual files

### JSON Output Example

When converting to JSON, you'll get a structured document like:

```json
{
  "archiveName": "example.lha",
  "fileCount": 3,
  "totalOriginalSize": 15420,
  "totalCompressedSize": 8234,
  "files": [
    {
      "filename": "readme.txt",
      "originalSize": 1024,
      "compressedSize": 512,
      "timestamp": "1995-08-15T14:30:00.000Z",
      "compressionMethod": "-lh5-",
      "crc": "0xA3F2",
      "compressionRatio": "50.00%",
      "isDirectory": false
    }
  ]
}
```

The handler is automatically registered and will appear as an option in the converter when:

- **Input**: `.lzh` or `.lha` files
- **Output**: ZIP archives or extracted individual files

## Technical Notes

### Compression Algorithm

LZH uses a combination of:

1. **LZSS**: Finds repeated byte sequences and references them
2. **Huffman Coding**: Encodes the LZSS tokens with variable-length codes
3. **Sliding Window**: Maintains a dictionary of recent bytes for matching

### Limitations

- Full Huffman tree decoding is simplified for common compression methods
- Some rare or proprietary LHA variants may not be fully supported
- Archive creation uses uncompressed storage (lh0) - full LZSS+Huffman compression not yet implemented
- Very large archives (>2GB) may have performance constraints in browser

## History

LHA was very popular in Japan and on bulletin board systems (BBS) in the early 1990s. The format specification has been placed in the public domain, making this clean-room implementation possible.

## References

- [LHA File Format Specification](https://web.archive.org/web/20021005080911/http://www.osirusoft.com/joejared/lzhformat.html)
- [LZSS Algorithm](https://en.wikipedia.org/wiki/Lempel%E2%80%93Ziv%E2%80%93Storer%E2%80%93Szymanski)
- [Huffman Coding](https://en.wikipedia.org/wiki/Huffman_coding)
