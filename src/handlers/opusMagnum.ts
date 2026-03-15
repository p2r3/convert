// file: opusMagnum.ts

import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats from "src/CommonFormats.ts";

interface OM_Molecule {
  primes: OM_Primes[];
  bonds: OM_Bonds[];
}

interface OM_Primes {
  element: number;
  x: number;
  y: number;
}

interface OM_Bonds {
  bond_type: number;
  source_x: number;
  source_y: number;
  destination_x: number;
  destination_y: number;
}

interface Dictionary<T> {
    [key: string]: T;
}

const elementSymbols: Dictionary<string> = {
    1: "🜔",
    2: "🜁",
    3: "🜃",
    4: "🜂",
    5: "🜄",
    6: "☿",
    7: "☉",
    8: "☽",
    9: "♀",
    10: "♂",
    11: "♃",
    12: "♄",
    13: "🜍",
    14: "🜞",
    15: "...",
    16: "✶",
}

const elementColors: Dictionary<string> = {
    1: "#A39770",
    2: "#B3F2F4",
    3: "#AFDC02",
    4: "#FE7516",
    5: "#2B686C",
    6: "#BBB5A2",
    7: "#9A601F",
    8: "#A6A4A0",
    9: "#814837",
    10: "#50413D",
    11: "#B0AD8C",
    12: "#95A7A8",
    13: "#C5AD9A",
    14: "#3A3829",
    15: "#0A0911",
    16: "#0A0911",
}

function twoComplement(input: number): number {
    if (input > 255) {
        throw "Error, coordinate over 255.";
    }
    else if (input >= 128) {
        return -(256-input);
    }
    else {
        return input;
    }
}

function renderMolecule(molecule: OM_Molecule): Uint8Array {
    // Begin building our SVG
    const encoder = new TextEncoder();
    let svg = "<svg xmlns='http://www.w3.org/2000/svg\' width='bigx' height='bigy' viewBox='smallx smally bigx bigy'>"
    
    const radius = 50;
    if (molecule.primes.length === 0) {
        throw "Error, empty molecule.";
    }
    
    // Draw the bonds
    for (let i = 0; i < molecule.bonds.length; i++) {
        // Convert hex-based coordinates to Cartesian
        let cartesian_source_x = twoComplement(molecule.bonds[i].source_x);
        let cartesian_source_y = twoComplement(molecule.bonds[i].source_y);
        let cartesian_destination_x = twoComplement(molecule.bonds[i].destination_x);
        let cartesian_destination_y = twoComplement(molecule.bonds[i].destination_y);
        
        // Hexagonal offset
        cartesian_source_x += 0.5*cartesian_source_y;
        cartesian_destination_x += 0.5*cartesian_destination_y;
        
        // Multiply coordinates for spacing
        cartesian_source_x *= radius*2.25;
        cartesian_source_y *= radius*2.25;
        cartesian_destination_x *= radius*2.25;
        cartesian_destination_y *= radius*2.25;
        
        svg += "\n"
        if (molecule.bonds[i].bond_type === 1) {
            svg += "    <line stroke='black' x1='"+cartesian_source_x+"' y1='"+cartesian_source_y+"' x2='"+cartesian_destination_x+"' y2='"+cartesian_destination_y+"' stroke-width='"+radius*0.2+"'/>"
        }
        else if (molecule.bonds[i].bond_type === 14) {
            svg += "    <line stroke='red' x1='"+cartesian_source_x+"' y1='"+cartesian_source_y+"' x2='"+cartesian_destination_x+"' y2='"+cartesian_destination_y+"' stroke-width='"+radius*0.4+"'/>"
            svg += "\n"
            svg += "    <line stroke='black' x1='"+cartesian_source_x+"' y1='"+cartesian_source_y+"' x2='"+cartesian_destination_x+"' y2='"+cartesian_destination_y+"' stroke-width='"+radius*0.2+"'/>"
            svg += "\n"
            svg += "    <line stroke='yellow' x1='"+cartesian_source_x+"' y1='"+cartesian_source_y+"' x2='"+cartesian_destination_x+"' y2='"+cartesian_destination_y+"' stroke-width='"+radius*0.1+"'/>"
        }
        else {
            throw "Error, invalid bond ("+molecule.bonds[i].bond_type+")";
        }
    }
    
    // Draw the atoms
    let leftmost = 99999;
    let upmost = 99999;
    
    let rightmost = -99999;
    let downmost = -99999;
    
    for (let i = 0; i < molecule.primes.length; i++) {
        // Validate primes
        if (molecule.primes[i].element > 16 || molecule.primes[i].element < 1 || Math.floor(molecule.primes[i].element) !== molecule.primes[i].element) {
            throw "Error, invalid prime ("+molecule.primes[i].element+")";
        }
    
        // Convert hex-based coordinates to Cartesian
        let cartesian_x = twoComplement(molecule.primes[i].x);
        let cartesian_y = twoComplement(molecule.primes[i].y);
        
        // Hexagonal offset
        cartesian_x += 0.5*cartesian_y;
        
        // Multiply coordinates for spacing
        cartesian_x *= radius*2.25;
        cartesian_y *= radius*2.25;
    
        // Render the atom
        svg += "\n"
        svg += "    <circle cx='"+cartesian_x+"' cy='"+cartesian_y+"' fill='black' r='"+radius+"'/>"
        svg += "\n"
        svg += "    <circle cx='"+cartesian_x+"' cy='"+cartesian_y+"' fill='"+elementColors[molecule.primes[i].element]+"' r='"+radius*0.9+"'/>"
        svg += "\n"
        svg += "    <text x='"+cartesian_x+"' y='"+cartesian_y+"' fill='white' text-anchor='middle' dominant-baseline='central' font-size='"+radius+"'>"+elementSymbols[molecule.primes[i].element]+"</text>"
        
        // Record largest coordinates
        if ((cartesian_x+radius) > rightmost) {
            rightmost = (cartesian_x+radius);
        }
        if ((cartesian_y+radius) > downmost) {
            downmost = (cartesian_y+radius);
        }
        if ((cartesian_x-radius) < leftmost) {
            leftmost = (cartesian_x-radius);
        }
        if ((cartesian_y-radius) < upmost) {
            upmost = (cartesian_y-radius);
        }
    }
    
    svg += "\n</svg>"
    
    // Replace placeholders with actual size. smallx/smally are half size - molecular center
    svg = svg.replace(/bigx/g,String((rightmost-leftmost))).replace(/bigy/g,String((downmost-upmost))).replace(/smallx/g,String((rightmost+leftmost)/2 - (rightmost-leftmost)/2)).replace(/smally/g,String((downmost+upmost)/2 - (downmost-upmost)/2));
    
    return encoder.encode(svg);
}

class opusMagnumHandler implements FormatHandler {

    public name: string = "opusMagnum";
    public supportedFormats?: FileFormat[];
    public ready: boolean = false;

    #canvas?: HTMLCanvasElement;
    #ctx?: CanvasRenderingContext2D;
    
    async init () {
        this.supportedFormats = [
            CommonFormats.SVG.supported("svg", false, true),
            {
                name: "Opus Magnum puzzle",
                format: "puzzle",
                extension: "puzzle",
                mime: "application/x-opus-magnum-puzzle",
                from: true,
                to: false,
                internal: "puzzle",
                lossless: false,
            },
        ];

        this.#canvas = document.createElement("canvas");
        this.#ctx = this.#canvas.getContext("2d") || undefined;

        this.ready = true;
    }

    async doConvert (
        inputFiles: FileData[],
        inputFormat: FileFormat,
        outputFormat: FileFormat
    ): Promise<FileData[]> {
        const outputFiles: FileData[] = [];
        
        if (!this.#canvas || !this.#ctx) {
            throw "Handler not initialized.";
        }
        
        if (inputFormat.internal === "puzzle" && outputFormat.internal === "svg") {
            for (const file of inputFiles) {
                // Begin reading file
                let byte_cusror = 0;
            
                // Get file version
                const version = file.bytes[byte_cusror];
            
                // Get name
                byte_cusror += 4;
                const name_rl = file.bytes[byte_cusror];
                byte_cusror += 1;
                const decoder = new TextDecoder();
                const puzzle_name = decoder.decode(file.bytes.subarray(byte_cusror,byte_cusror+name_rl));
                console.log(puzzle_name);
                
                // Parse reagents data
                byte_cusror += name_rl+16;
                const reagents_rl = file.bytes[byte_cusror];
                const reagents : OM_Molecule[] = [];
                
                byte_cusror += 4;
                
                while (reagents.length < reagents_rl) {
                    // Establish working module
                    let working_molecule : OM_Molecule = {primes: [], bonds: []};
                    
                    // Start of loop, read primes run length
                    const primes_rl = file.bytes[byte_cusror];
                    
                    // Increment cursor by 4 due to padding.
                    byte_cusror += 4;
                    
                    // Parse primes data.
                    while (working_molecule.primes.length < primes_rl) {
                        working_molecule.primes.push({element: file.bytes[byte_cusror], x: file.bytes[byte_cusror+1], y: file.bytes[byte_cusror+2]});
                        byte_cusror += 3;
                    }
                    
                    // Arrive at bonds data.
                    const bonds_rl = file.bytes[byte_cusror];
                    
                    // Increment cursor by 4 due to padding.
                    byte_cusror += 4;
                    
                    // Parse bonds data.
                    while (working_molecule.bonds.length < bonds_rl) {
                        working_molecule.bonds.push({bond_type: file.bytes[byte_cusror], source_x: file.bytes[byte_cusror+1], source_y: file.bytes[byte_cusror+2], destination_x: file.bytes[byte_cusror+3], destination_y: file.bytes[byte_cusror+4]});
                        byte_cusror += 5;
                    }
                    
                    // Push molecule
                    reagents.push(working_molecule);
                }
                
                // Parse the products data, which follows immediately after.
                const products_rl = file.bytes[byte_cusror];
                const products : OM_Molecule[] = [];
                
                byte_cusror += 4;
                
                while (products.length < products_rl) {
                    // Establish working module
                    let working_molecule : OM_Molecule = {primes: [], bonds: []};
                    
                    // Start of loop, read primes run length
                    const primes_rl = file.bytes[byte_cusror];
                    
                    // Increment cursor by 4 due to padding.
                    byte_cusror += 4;
                    
                    // Parse primes data.
                    while (working_molecule.primes.length < primes_rl) {
                        working_molecule.primes.push({element: file.bytes[byte_cusror], x: file.bytes[byte_cusror+1], y: file.bytes[byte_cusror+2]});
                        byte_cusror += 3;
                    }
                    
                    // Arrive at bonds data.
                    const bonds_rl = file.bytes[byte_cusror];
                    
                    // Increment cursor by 4 due to padding.
                    byte_cusror += 4;
                    
                    // Parse bonds data.
                    while (working_molecule.bonds.length < bonds_rl) {
                        working_molecule.bonds.push({bond_type: file.bytes[byte_cusror], source_x: file.bytes[byte_cusror+1], source_y: file.bytes[byte_cusror+2], destination_x: file.bytes[byte_cusror+3], destination_y: file.bytes[byte_cusror+4]});
                        byte_cusror += 5;
                    }
                    
                    // Push molecule
                    products.push(working_molecule);
                }
                
                console.log(reagents);
                console.log(products);
                
                // Render each molecule as a separate file.
                for (let i = 0; i < reagents.length; i++) {
                    outputFiles.push({ bytes: renderMolecule(reagents[i]), name: puzzle_name + "_reagent_" + i + "." + outputFormat.extension });
                }
                for (let i = 0; i < products.length; i++) {
                    outputFiles.push({ bytes: renderMolecule(products[i]), name: puzzle_name + "_product_" + i + "." + outputFormat.extension });
                }
            }
        }
        else {
            throw new Error("Invalid input-output.");
        }
        
        return outputFiles;
    }
}

export default opusMagnumHandler;