/**
 * LZH/LHA Archive Encoder
 * Creates LHA archive format files
 */

export interface LHAFileInput {
  filename: string;
  data: Uint8Array;
  timestamp?: Date;
}

export class LZHEncoder {
  private output: Uint8Array[] = [];

  /**
   * Create an LHA archive from multiple files
   */
  public create(files: LHAFileInput[]): Uint8Array {
    this.output = [];

    for (const file of files) {
      this.writeFileHeader(file);
    }

    // Write end marker (0x00)
    this.output.push(new Uint8Array([0x00]));

    // Concatenate all chunks
    const totalLength = this.output.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of this.output) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result;
  }

  private writeFileHeader(file: LHAFileInput): void {
    const timestamp = file.timestamp || new Date();
    const method = "-lh0-"; // Store method (no compression)
    const compressedData = file.data;
    const originalSize = file.data.length;
    const compressedSize = compressedData.length;
    const crc = this.calculateCRC16(file.data);

    // Prepare filename (ensure it's not too long)
    const filenameBytes = new TextEncoder().encode(file.filename);
    const filenameLength = Math.min(filenameBytes.length, 255);

    // Calculate header size (level 0)
    // 2 (header size + checksum) + 5 (method) + 4 (comp size) + 4 (orig size) + 
    // 2 (time) + 2 (date) + 1 (attr) + 1 (level) + 1 (name len) + name + 2 (crc)
    const baseHeaderSize = 2 + 5 + 4 + 4 + 2 + 2 + 1 + 1 + 1 + filenameLength + 2;
    const headerSize = baseHeaderSize - 2; // Size doesn't include the size byte itself and checksum

    const header = new Uint8Array(baseHeaderSize);
    let offset = 0;

    // Header size
    header[offset++] = headerSize;

    // Header checksum (calculate later)
    const checksumOffset = offset;
    header[offset++] = 0;

    // Method
    const methodBytes = new TextEncoder().encode(method);
    header.set(methodBytes, offset);
    offset += 5;

    // Compressed size
    this.writeDWord(header, offset, compressedSize);
    offset += 4;

    // Original size
    this.writeDWord(header, offset, originalSize);
    offset += 4;

    // MS-DOS timestamp
    const dosTime = this.dateToDosTime(timestamp);
    this.writeWord(header, offset, dosTime.time);
    offset += 2;
    this.writeWord(header, offset, dosTime.date);
    offset += 2;

    // Attributes (0x20 = archive bit)
    header[offset++] = 0x20;

    // Level (0)
    header[offset++] = 0x00;

    // Filename length
    header[offset++] = filenameLength;

    // Filename
    header.set(filenameBytes.slice(0, filenameLength), offset);
    offset += filenameLength;

    // CRC-16
    this.writeWord(header, offset, crc);
    offset += 2;

    // Calculate and set header checksum
    header[checksumOffset] = this.calculateHeaderChecksum(header, 2, headerSize);

    // Write header
    this.output.push(header);

    // Write compressed data
    this.output.push(compressedData);
  }

  // Write methods using bitwise operations for efficiency
  private writeWord(buffer: Uint8Array, offset: number, value: number): void {
    buffer[offset] = value & 0xFF;
    buffer[offset + 1] = (value >> 8) & 0xFF;
  }

  private writeDWord(buffer: Uint8Array, offset: number, value: number): void {
    buffer[offset] = value & 0xFF;
    buffer[offset + 1] = (value >> 8) & 0xFF;
    buffer[offset + 2] = (value >> 16) & 0xFF;
    buffer[offset + 3] = (value >> 24) & 0xFF;
  }

  private dateToDosTime(date: Date): { date: number; time: number } {
    const year = Math.max(1980, Math.min(2107, date.getFullYear()));
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hour = date.getHours();
    const minute = date.getMinutes();
    const second = Math.floor(date.getSeconds() / 2);

    const dosDate = ((year - 1980) << 9) | (month << 5) | day;
    const dosTime = (hour << 11) | (minute << 5) | second;

    return { date: dosDate, time: dosTime };
  }

  private calculateHeaderChecksum(header: Uint8Array, start: number, length: number): number {
    let sum = 0;
    for (let i = start; i < start + length; i++) {
      sum += header[i];
    }
    return sum & 0xFF;
  }

  private calculateCRC16(data: Uint8Array): number {
    let crc = 0;
    
    for (let i = 0; i < data.length; i++) {
      crc ^= data[i] << 8;
      for (let j = 0; j < 8; j++) {
        if (crc & 0x8000) {
          crc = (crc << 1) ^ 0x1021;
        } else {
          crc = crc << 1;
        }
      }
    }
    
    return crc & 0xFFFF;
  }
}
