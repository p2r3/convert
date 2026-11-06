import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import Formats, { SpecialFormats } from "src/Formats.ts";
import { changeExt, decode, encode } from "src/common/index.ts";
import { extractedParent, filePath, splitPath } from "src/common/path.ts";

function read_lendian_4(a: number, b: number, c: number, d: number): number {
  return a + b * Math.pow(16, 2) + c * Math.pow(16, 4) + d * Math.pow(16, 6);
}

function write_lendian_4(x: number): number[] {
  if (x > 0xffffffff) {
    throw new Error("Error in write_lendian_4: number too big.");
  }
  if (x < 0x00) {
    throw new Error("Error in write_lendian_4: number is negative.");
  }

  let num_string: string = x.toString(16);

  while (num_string.length < 8) {
    num_string = "0" + num_string;
  }

  console.log("write_lendian_4: (" + x + ") (" + num_string + ")");

  const array: number[] = [
    parseInt(num_string.substring(6, 8), 16),
    parseInt(num_string.substring(4, 6), 16),
    parseInt(num_string.substring(2, 4), 16),
    parseInt(num_string.substring(0, 2), 16),
  ];
  console.log("write_lendian_4: " + array);
  return array;
}

class brarchiveHandler implements FormatHandler {
  public readonly name = "brarchive";
  public supportedFormats = [
    Formats.BRARCHIVE.builder("brarchive").lossless().fromTo(),
    SpecialFormats.ANY.builder("ANY").lossless().fromTo(),
  ];
  public ready = false;

  async init() {
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];

    if (inputFormat.internal === "brarchive" && outputFormat.mime === SpecialFormats.ANY.mime) {
      // Thanks to @santiago046's documentation

      const file_entry_size = 1 + 247 + 4 + 4; // the size of a single FileEntry

      for (const file of inputFiles) {
        const numEntries: number = read_lendian_4(
          file.bytes[0x08],
          file.bytes[0x09],
          file.bytes[0x0a],
          file.bytes[0x0b],
        );

        // FileEntries begin at 0x10. Read them and store to an array we can look up later.
        let byte_cursor = 0x10;
        const FileEntries_info: string[][] = [];
        for (let i = 0; i < numEntries; i++) {
          const file_name_length = file.bytes[byte_cursor];
          byte_cursor++;
          const file_name: string = decode(
            file.bytes.subarray(byte_cursor, byte_cursor + file_name_length),
          );
          byte_cursor += 247; // Names are stored as padded 247-length strings?? Weird but seems to be true.
          const relative_offset: number = read_lendian_4(
            file.bytes[byte_cursor],
            file.bytes[byte_cursor + 1],
            file.bytes[byte_cursor + 2],
            file.bytes[byte_cursor + 3],
          );
          const absolute_offset: string = (
            relative_offset +
            16 +
            file_entry_size * numEntries
          ).toString();
          byte_cursor += 4;
          const data_size: string = read_lendian_4(
            file.bytes[byte_cursor],
            file.bytes[byte_cursor + 1],
            file.bytes[byte_cursor + 2],
            file.bytes[byte_cursor + 3],
          ).toString();

          if (data_size === "0") {
            throw new Error("Error, file has no data. Can't meaningfully convert.");
          }

          // Finally, store that information in the array
          FileEntries_info.push([file_name, absolute_offset, data_size]);

          // Jump byte_cursor one more time so we start the next loop at the next entry.
          byte_cursor += 4;
        }

        // We now have the information we need. Begin pushing the files to a FileData array.
        const archiveFiles: FileData[] = [];

        for (let i = 0; i < FileEntries_info.length; i++) {
          archiveFiles.push({
            name: FileEntries_info[i][0],
            bytes: file.bytes.subarray(
              parseInt(FileEntries_info[i][1]),
              parseInt(FileEntries_info[i][1]) + parseInt(FileEntries_info[i][2]),
            ),
          });
        }

        // Extract everything; the converter detects what the files are.
        const parent = extractedParent(file, inputFiles.length > 1);
        for (const ar_file of archiveFiles) {
          outputFiles.push({ ...splitPath(ar_file.name, parent), bytes: ar_file.bytes });
        }
      }
    } else if (outputFormat.internal === "brarchive" && inputFormat.internal !== "brarchive") {
      // Pack all inputs into one archive. Mostly JSON in practice, but any bytes are fine.
      const working_files: { [key: string]: FileData[] } = {
        "Unnamed.brarchive": inputFiles,
      };

      // Iterate through each collection of files.
      for (const key in working_files) {
        // Unlikely, but handle it.
        if (working_files[key].length > 0xffffffff) {
          throw new Error("Too many input files to encode in 4 bytes.");
        }

        // Zip all the inputs into one archive.
        const working_bytes: number[] = [];

        // Write headers and magic numbers.
        working_bytes.push(0x7d, 0x27, 0x25, 0xb1);
        working_bytes.push(0xa0, 0x52, 0x70, 0x26);
        working_bytes.push(...write_lendian_4(working_files[key].length));
        working_bytes.push(0x01, 0x00, 0x00, 0x00);

        // Start writing FileEntry's
        for (let i = 0; i < working_files[key].length; i++) {
          // Shorten name if need be
          let name = filePath(working_files[key][i]);
          while (encode(name).length > 247) {
            name = name.substring(0, name.length - 1);
          }

          const name_bytes: Uint8Array = encode(name);
          working_bytes.push(name_bytes.length);

          // Push name and padding
          working_bytes.push(...name_bytes);
          for (let pushed = name_bytes.length; pushed < 247; pushed++) {
            working_bytes.push(0x00);
          }

          // Relative offset is the sum of the file sizes of every file that comes before it.
          let relative_offset = 0;
          for (let i2 = i - 1; i2 >= 0; i2--) {
            relative_offset += working_files[key][i2].bytes.length;
          }
          working_bytes.push(...write_lendian_4(relative_offset));

          // Then, the file size of *this* file.
          working_bytes.push(...write_lendian_4(working_files[key][i].bytes.length));
        }

        // FileEntry's are done. Write raw data.
        for (let i = 0; i < working_files[key].length; i++) {
          working_bytes.push(...working_files[key][i].bytes);
        }

        // Finally, push our file.
        outputFiles.push({
          bytes: new Uint8Array(working_bytes),
          name: changeExt(key, outputFormat.extension),
        });
      }
    } else {
      throw new Error("Invalid input-output");
    }

    return outputFiles;
  }
}

export default brarchiveHandler;
