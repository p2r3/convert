import type { FileData, FileFormat, FormatHandler } from "src/FormatHandler";
import * as NBT from "nbtify";
import { gunzipSync, gzipSync } from "fflate";

class mcSchematicHandler implements FormatHandler {
    public name: string = "mcSchematic";
    public supportedFormats?: FileFormat[];
    public ready: boolean = false;

    async init() {
        this.supportedFormats = [
            {
                name: "Minecraft Schematic",
                format: "schematic",
                extension: "schematic",
                mime: "application/x-minecraft-schematic",
                from: true,
                to: true,
                internal: "schematic",
                category: "data",
                lossless: true
            },
            {
                name: "Sponge Schematic",
                format: "schem",
                extension: "schem",
                mime: "application/x-minecraft-schem",
                from: true,
                to: true,
                internal: "schem",
                category: "data",
                lossless: true
            },
            {
                name: "Litematica Schematic",
                format: "litematic",
                extension: "litematic",
                mime: "application/x-minecraft-litematic",
                from: true,
                to: true,
                internal: "litematic",
                category: "data",
                lossless: true
            },
            // Target internal format for graph routing
            {
                name: "Named Binary Tag",
                format: "nbt",
                extension: "nbt",
                mime: "application/x-minecraft-nbt",
                from: false,
                to: true,
                internal: "nbt",
                category: "data",
                lossless: true
            }
        ];
        this.ready = true;
    }

    async doConvert(
        inputFiles: FileData[],
        inputFormat: FileFormat,
        outputFormat: FileFormat
    ): Promise<FileData[]> {
        const outputFiles: FileData[] = [];

        for (const file of inputFiles) {
            // Decompress GZipped NBT input
            let unzipped;
            try {
                unzipped = gunzipSync(file.bytes);
            } catch (e) {
                // Fallback for uncompressed NBT
                unzipped = file.bytes;
            }

            const nbt = await NBT.read(unzipped);

            let resultNbt = new NBT.NBTData({});

            if (inputFormat.internal === "litematic") {
                resultNbt = this.litematicToSchem(nbt.data);
            } else if (inputFormat.internal === "schematic" || inputFormat.internal === "schem") {
                 if (outputFormat.internal === "litematic") {
                     resultNbt = this.schemToLitematic(nbt.data);
                 } else {
                     // Route Native Schematic NBTs to graph path
                     resultNbt = nbt;
                 }
            } else {
                throw `Unsupported conversion route: ${inputFormat.internal} -> ${outputFormat.internal}`;
            }

            // Output processed intermediate NBT
            let outBytes = await NBT.write(resultNbt);
            
            // Handle file compression natively for endpoints (Litematic <-> Schem)
            if (outputFormat.internal === "litematic" || outputFormat.internal === "schem" || outputFormat.internal === "schematic") {
                outBytes = gzipSync(outBytes);
                outputFiles.push({
                    name: file.name.split(".")[0] + "." + outputFormat.extension,
                    bytes: outBytes
                });
            } else {
                // Not a native out-format (e.g., routing to JSON). Fallback to NBT extension for graph bridges.
                outputFiles.push({
                    name: file.name.split(".")[0] + ".nbt",
                    bytes: outBytes
                });
            }
        }

        return outputFiles;
    }


    /**
     * Converts a Litematica NBT compound into a Sponge Schematic V2 NBT compound.
     * Note: Currently supports single-region Litematica files.
     */
    private litematicToSchem(data: any): NBT.NBTData {
        const root = data as any;
        
        // 1. Validate
        if (!root.Regions) {
            throw "Invalid Litematica file: Missing Regions tag.";
        }

        // 2. Select first region
        const regionNames = Object.keys(root.Regions);
        if (regionNames.length === 0) {
            throw "Invalid Litematica file: No regions defined.";
        }
        const region = root.Regions[regionNames[0]];

        // Dimensions
        const width = Math.abs(region.Size.x);
        const height = Math.abs(region.Size.y);
        const length = Math.abs(region.Size.z);

        const totalBlocks = width * height * length;

        // 3. Extract Palette
        const litePalette = region.BlockStatePalette;
        const schemPalette: { [key: string]: NBT.Tag } = {};

        for (let i = 0; i < litePalette.length; i++) {
            const entry = litePalette[i];
            let name = entry.Name;
            if (entry.Properties) {
                const props = [];
                for (const key of Object.keys(entry.Properties)) {
                    props.push(`${key}=${entry.Properties[key]}`);
                }
                if (props.length > 0) {
                    name += `[${props.join(",")}]`;
                }
            }
            schemPalette[name] = new NBT.Int32(i);
        }

        // 4. Extract Block Data
        // Calculate bits per block using palette size
        const bitsPerBlock = Math.max(2, Math.ceil(Math.log2(litePalette.length)));
        const blockStates = region.BlockStates; // nbtify LongArray

        const blockData = new Uint8Array(totalBlocks);

        if (blockStates && blockStates.length > 0) {
            // Unpack bit logic payload into Uint8Array
            const longs = new BigInt64Array(blockStates.buffer);
            
            let blockIndex = 0;
            const mask = (1n << BigInt(bitsPerBlock)) - 1n;

            for (let y = 0; y < height; y++) {
                for (let z = 0; z < length; z++) {
                    for (let x = 0; x < width; x++) {
                        if (blockIndex >= totalBlocks) break;

                        const bitIndex = BigInt(blockIndex) * BigInt(bitsPerBlock);
                        const longIndex = Number(bitIndex / 64n);
                        const bitOffset = bitIndex % 64n;

                        let value = (longs[longIndex] >> bitOffset) & mask;

                        // Handle 64-bit boundary overlap
                        if (bitOffset + BigInt(bitsPerBlock) > 64n && longIndex + 1 < longs.length) {
                            const remainingBits = (bitOffset + BigInt(bitsPerBlock)) - 64n;
                            const nextValueMask = (1n << remainingBits) - 1n;
                            const nextValue = longs[longIndex + 1] & nextValueMask;
                            value = value | (nextValue << (64n - bitOffset));
                        }

                        // Write mapped block ID (y, z, x)
                        blockData[blockIndex] = Number(value);
                        blockIndex++;
                    }
                }
            }
        }

        // 5. Build Schem NBT
        // Encode blockData as VarInt array

        const varIntBlockData: number[] = [];
        for (let i = 0; i < totalBlocks; i++) {
            let value = blockData[i];
            while ((value & -128) !== 0) {
                varIntBlockData.push((value & 127) | 128);
                value >>>= 7;
            }
            varIntBlockData.push(value);
        }


        let metadata = {
            Name: root.Metadata?.Name || "Converted Litematic",
            Author: root.Metadata?.Author || "Unknown",
            Date: BigInt(Date.now()),
            RequiredMods: []
        };

        const result = new NBT.NBTData({
            Version: new NBT.Int32(2), 
            DataVersion: new NBT.Int32(root.MinecraftDataVersion || 2566),
            Metadata: metadata,
            Width: new NBT.Int16(width),
            Height: new NBT.Int16(height),
            Length: new NBT.Int16(length),
            PaletteMax: new NBT.Int32(litePalette.length),
            Palette: schemPalette,
            BlockData: new Int8Array(varIntBlockData), 
            BlockEntities: region.TileEntities || [],
            Entities: region.Entities || []
        }, { rootName: "Schematic" });

        return result;
    }

    /**
     * Converts a Sponge Schematic V2 NBT compound into a Litematica NBT compound.
     */
    private schemToLitematic(data: any): NBT.NBTData {
        const root = data as any;
        
        // 1. Validate
        if (!root.Width || !root.Height || !root.Length || !root.Palette || !root.BlockData) {
            throw "Invalid Schematic file: Missing required size or block data tags.";
        }

        const width = root.Width.valueOf();
        const height = root.Height.valueOf();
        const length = root.Length.valueOf();
        const totalBlocks = width * height * length;

        // 2. Extract Palette
        const schemPalette = root.Palette; // Dictionary of { "minecraft:stone": NBT.Int32 }
        const litePalette: any[] = [];
        
        // Invert schematic palette to an array indexed by the ID
        const invertedPalette: { [id: number]: string } = {};
        for (const [key, value] of Object.keys(schemPalette).map(k => [k, schemPalette[k].valueOf()])) {
            invertedPalette[value as number] = key as string;
        }

        const paletteSize = Object.keys(invertedPalette).length;

        // Build Litematica Palette Array [{Name: "minecraft:stone", Properties: {...}}]
        for (let i = 0; i < paletteSize; i++) {
            const rawName = invertedPalette[i];
            if (!rawName) {
                 // Fallback if missing id
                 litePalette.push({ Name: "minecraft:air" });
                 continue;
            }

            // Parse Properties "minecraft:stairs[facing=east,half=bottom]"
            const bracketIndex = rawName.indexOf('[');
            if (bracketIndex > -1) {
                 const name = rawName.substring(0, bracketIndex);
                 const propsString = rawName.substring(bracketIndex + 1, rawName.length - 1);
                 const props: any = {};
                 
                 propsString.split(',').forEach(p => {
                     const [k, v] = p.split('=');
                     props[k] = v;
                 });

                 litePalette.push({ Name: name, Properties: props });
            } else {
                 litePalette.push({ Name: rawName });
            }
        }

        // 3. Extract Block Data (VarInt Byte Array -> Integer Array)
        const blockDataBytes = new Uint8Array(root.BlockData);
        let blockIds = new Int32Array(totalBlocks);
        
        let byteIndex = 0;
        for (let i = 0; i < totalBlocks; i++) {
             let value = 0;
             let varIntLength = 0;
             let currentByte;

             while (true) {
                 currentByte = blockDataBytes[byteIndex];
                 value |= (currentByte & 127) << (varIntLength++ * 7);
                 byteIndex++;
                 if (varIntLength > 5) {
                     throw "VarInt is too big";
                 }
                 if ((currentByte & 128) !== 128) {
                     break;
                 }
             }
             blockIds[i] = value;
        }

        // 4. Pack Block Data (Integer Array -> Bit-Packed BigInt64Array)
        const bitsPerBlock = Math.max(2, Math.ceil(Math.log2(paletteSize)));
        const longsCount = Math.ceil((totalBlocks * bitsPerBlock) / 64);
        const longs = new BigInt64Array(longsCount);

        let blockIndex = 0;
        for (let y = 0; y < height; y++) {
             for (let z = 0; z < length; z++) {
                  for (let x = 0; x < width; x++) {
                       if (blockIndex >= totalBlocks) break;

                       const blockId = BigInt(blockIds[blockIndex]);
                       const bitIndex = BigInt(blockIndex) * BigInt(bitsPerBlock);
                       const longIndex = Number(bitIndex / 64n);
                       const bitOffset = bitIndex % 64n;

                       // Pack value into long
                       longs[longIndex] |= (blockId << bitOffset);

                       // Handle boundary overlap
                       if (bitOffset + BigInt(bitsPerBlock) > 64n && longIndex + 1 < longs.length) {
                            const remainingBits = (bitOffset + BigInt(bitsPerBlock)) - 64n;
                            longs[longIndex + 1] |= (blockId >> (64n - bitOffset));
                       }
                       
                       blockIndex++;
                  }
             }
        }

        // 5. Build Litematic NBT
        const litematicMetadata = {
            Author: root.Metadata?.Author || "Converted",
            Name: root.Metadata?.Name || "Converted Schematic",
            Description: "",
            RegionCount: new NBT.Int32(1),
            TimeCreated: new NBT.Float32(Date.now()),
            TimeModified: new NBT.Float32(Date.now()),
            TotalBlocks: new NBT.Int32(totalBlocks),
            TotalVolume: new NBT.Int32(totalBlocks)
        };

        const region = {
            Position: { x: new NBT.Int32(0), y: new NBT.Int32(0), z: new NBT.Int32(0) },
            Size: { x: new NBT.Int32(width), y: new NBT.Int32(height), z: new NBT.Int32(length) },
            BlockStatePalette: litePalette,
            BlockStates: new BigInt64Array(longs), // NBT Long Array
            TileEntities: root.BlockEntities || [],
            Entities: root.Entities || [],
            PendingBlockTicks: [],
            PendingFluidTicks: []
        };

        const result = new NBT.NBTData({
            MinecraftDataVersion: new NBT.Int32(root.DataVersion?.valueOf() || 2566),
            Version: new NBT.Int32(6), // Litematic format v6
            Metadata: litematicMetadata,
            Regions: {
                 "Converted": region
            }
        }, { rootName: "Litematic" });

        return result;
    }
}

export default mcSchematicHandler;
