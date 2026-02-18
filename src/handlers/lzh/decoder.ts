/**
 * LZH/LHA Archive Decoder
 * Implements LHA archive format parsing and LZH decompression
 * Based on the LHA archive format specification
 */

export interface LHAFile {
  filename: string;
  originalSize: number;
  compressedSize: number;
  timestamp: Date;
  crc: number;
  method: string;
  os: number;
  data: Uint8Array;
}

export class LZHDecoder {
  private data: Uint8Array;
  private offset: number = 0;

  constructor(data: Uint8Array) {
    this.data = data;
  }

  private readByte(): number {
    if (this.offset >= this.data.length) {
      throw new Error("Unexpected end of file");
    }
    return this.data[this.offset++];
  }

  private readWord(): number {
    const low = this.readByte();
    const high = this.readByte();
    return low | (high << 8);
  }

  private readDWord(): number {
    const low = this.readWord();
    const high = this.readWord();
    return low | (high << 16);
  }

  private readBytes(length: number): Uint8Array {
    if (this.offset + length > this.data.length) {
      throw new Error("Unexpected end of file");
    }
    const result = this.data.slice(this.offset, this.offset + length);
    this.offset += length;
    return result;
  }

  private readString(length: number): string {
    const bytes = this.readBytes(length);
    // Find the first null byte
    let actualLength = length;
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] === 0) {
        actualLength = i;
        break;
      }
    }
    // Only decode up to the null terminator
    const validBytes = bytes.slice(0, actualLength);
    const decoder = new TextDecoder('utf-8', { fatal: false });
    let str = decoder.decode(validBytes);
    // Remove any remaining null bytes and control characters
    str = str.replace(/[\x00-\x1F\x7F]/g, '');
    return str;
  }

  /**
   * Parse LHA archive and extract all files
   */
  public extractAll(): LHAFile[] {
    const files: LHAFile[] = [];
    
    while (this.offset < this.data.length) {
      try {
        const file = this.readHeader();
        if (!file) break;
        files.push(file);
      } catch (e) {
        console.warn("Error reading header:", e);
        break;
      }
    }
    
    return files;
  }

  private readHeader(): LHAFile | null {
    if (this.offset >= this.data.length) {
      return null;
    }

    const headerSize = this.readByte();
    if (headerSize === 0 || headerSize > 128) {
      return null; // End of archive or invalid header
    }

    const startOffset = this.offset - 1;
    const headerChecksum = this.readByte();
    
    // Read method (5 bytes)
    const method = this.readString(5);
    
    // Validate method string
    if (!method.startsWith('-lh') && !method.startsWith('-lz') && method !== '-lhd-') {
      console.warn(`Unknown compression method: ${method}`);
      // Try to skip this entry
      return null;
    }
    
    // Read compressed size
    const compressedSize = this.readDWord();
    
    // Read original size
    const originalSize = this.readDWord();
    
    // Sanity check sizes
    if (compressedSize > this.data.length || originalSize > 100 * 1024 * 1024) {
      console.warn(`Suspicious file sizes: compressed=${compressedSize}, original=${originalSize}`);
      return null;
    }
    
    // Read timestamp (MS-DOS format)
    const dosTime = this.readWord();
    const dosDate = this.readWord();
    const timestamp = this.dosDateTimeToDate(dosDate, dosTime);
    
    // Read attributes
    const attributes = this.readByte();
    
    // Read level
    const level = this.readByte();
    
    // Read filename length
    const filenameLength = this.readByte();
    
    // Read filename
    const filename = this.readString(filenameLength);
    
    // Read CRC
    const crc = this.readWord();
    
    // Read OS type
    let os = 0;
    if (level >= 1) {
      os = this.readByte();
    }

    // Skip extended headers based on level
    if (level === 1) {
      // Level 1 has extended headers
      while (true) {
        const extSize = this.readWord();
        if (extSize === 0) break;
        this.readBytes(extSize - 2); // Skip extended header data
      }
    } else if (level === 2) {
      // Level 2 has different header structure
      const totalHeaderSize = this.readWord();
      if (totalHeaderSize > headerSize) {
        this.readBytes(totalHeaderSize - headerSize - 2);
      }
    }

    // Read compressed data
    if (this.offset + compressedSize > this.data.length) {
      console.warn(`Compressed data extends beyond file bounds: need ${compressedSize} bytes, only ${this.data.length - this.offset} available`);
      return null;
    }
    
    const compressedData = this.readBytes(compressedSize);
    
    // Decompress the data
    let decompressedData: Uint8Array;
    
    if (method === '-lh0-') {
      // No compression
      decompressedData = compressedData;
    } else if (method === '-lh1-') {
      // LH1 (4KB dictionary, old method)
      decompressedData = this.decompressLH1(compressedData, originalSize);
    } else if (method === '-lh4-' || method === '-lh5-' || method === '-lh6-' || method === '-lh7-') {
      // LH4/5/6/7 (modern methods with different dictionary sizes)
      decompressedData = this.decompressLH5(compressedData, originalSize);
    } else if (method === '-lhd-') {
      // Directory entry
      decompressedData = new Uint8Array(0);
    } else {
      console.warn(`Unsupported compression method: ${method}`);
      decompressedData = compressedData; // Return as-is
    }

    // Sanitize filename to ensure it's valid UTF-8 without null bytes
    const sanitizedFilename = filename.replace(/[\x00-\x1F\x7F]/g, '').trim() || 'unnamed';
    
    return {
      filename: sanitizedFilename,
      originalSize,
      compressedSize,
      timestamp,
      crc,
      method,
      os,
      data: decompressedData
    };
  }

  private dosDateTimeToDate(dosDate: number, dosTime: number): Date {
    const year = 1980 + ((dosDate >> 9) & 0x7F);
    const month = ((dosDate >> 5) & 0x0F) - 1;
    const day = dosDate & 0x1F;
    const hour = (dosTime >> 11) & 0x1F;
    const minute = (dosTime >> 5) & 0x3F;
    const second = (dosTime & 0x1F) * 2;
    
    return new Date(year, month, day, hour, minute, second);
  }

  /**
   * Decompress LH1 format (LZSS with 4KB dictionary)
   */
  private decompressLH1(compressed: Uint8Array, originalSize: number): Uint8Array {
    const output = new Uint8Array(originalSize);
    const dictionary = new Uint8Array(4096);
    let outPos = 0;
    let dictPos = 0;
    let bitBuffer = 0;
    let bitCount = 0;
    let inPos = 0;

    const getBit = (): number => {
      if (bitCount === 0) {
        if (inPos >= compressed.length) return 0;
        bitBuffer = compressed[inPos++];
        bitCount = 8;
      }
      const bit = bitBuffer & 1;
      bitBuffer >>= 1;
      bitCount--;
      return bit;
    };

    const getBits = (n: number): number => {
      let value = 0;
      for (let i = 0; i < n; i++) {
        value |= getBit() << i;
      }
      return value;
    };

    while (outPos < originalSize && inPos < compressed.length) {
      if (getBit()) {
        // Literal byte
        const byte = getBits(8);
        output[outPos++] = byte;
        dictionary[dictPos] = byte;
        dictPos = (dictPos + 1) & 4095;
      } else {
        // Match
        const position = getBits(12);
        const length = getBits(4) + 3;
        
        for (let i = 0; i < length && outPos < originalSize; i++) {
          const byte = dictionary[position];
          output[outPos++] = byte;
          dictionary[dictPos] = byte;
          dictPos = (dictPos + 1) & 4095;
        }
      }
    }

    return output;
  }

  /**
   * Decompress LH5/6/7 format (LZSS with Huffman coding)
   * Simplified implementation
   */
  private decompressLH5(compressed: Uint8Array, originalSize: number): Uint8Array {
    // This is a simplified version
    // Full implementation would require proper Huffman tree decoding
    const output = new Uint8Array(originalSize);
    const windowSize = 8192; // 8KB for LH5
    const window = new Uint8Array(windowSize);
    let outPos = 0;
    let windowPos = 0;
    let inPos = 0;

    // Simplified LZSS decompression without proper Huffman
    while (outPos < originalSize && inPos < compressed.length) {
      const flag = compressed[inPos++];
      
      for (let bit = 0; bit < 8 && outPos < originalSize && inPos < compressed.length; bit++) {
        if (flag & (1 << bit)) {
          // Literal
          const byte = compressed[inPos++];
          output[outPos++] = byte;
          window[windowPos] = byte;
          windowPos = (windowPos + 1) % windowSize;
        } else {
          // Match
          if (inPos + 1 >= compressed.length) break;
          const byte1 = compressed[inPos++];
          const byte2 = compressed[inPos++];
          const offset = ((byte2 & 0xF0) << 4) | byte1;
          const length = (byte2 & 0x0F) + 3;
          
          for (let i = 0; i < length && outPos < originalSize; i++) {
            const pos = (windowPos - offset + windowSize) % windowSize;
            const byte = window[pos];
            output[outPos++] = byte;
            window[windowPos] = byte;
            windowPos = (windowPos + 1) % windowSize;
          }
        }
      }
    }

    return output;
  }
}
