import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import {JsonType} from "./jsonToC/JsonType.ts";
import JsonTypeFactory from "./jsonToC/JsonTypeFactory.ts";

export default class jsonToCHandler implements FormatHandler {
    /**************************************************/
    /* Class to handle conversion between JSON and C  */
    /**************************************************/

    public name: string = "c";
    public supportedFormats?: FileFormat[] = [
        {
            name: "C Source File",
            format: "c",
            extension: "c",
            mime: "text/x-c",
            from: true,
            to: true,
            internal: "c"
        },
        {
            name: "JavaScript Object Notation",
            format: "json",
            extension: "json",
            mime: "application/json",
            from: true,
            to: true,
            internal: "json"
        }
    ];

    public ready: boolean = false;
    
    async init () {
        this.ready = true;
    }

    async doConvert(
        inputFiles: FileData[],
        inputFormat: FileFormat,
        outputFormat: FileFormat
    ): Promise<FileData[]> {
        
        let outputFiles: FileData[] = new Array<FileData>();

        for (const file of inputFiles) {
            let bytes: Uint8Array = new Uint8Array();
            switch (outputFormat.internal) {
                case "c":
                    if (inputFormat.internal === "json") {
                        console.log("converting from .json to .c");
                        bytes = await this.jsonToC(file);
                    }
                    break;
                case "json":
                    if (inputFormat.internal === "c") {
                        console.log("converting from .c to .json")
                        bytes = await this.cToJson(file);
                    }
                break;
            }
            
            if (bytes.length > 0) {
                let name = file.name.split(".")[0] + "." + outputFormat.extension;
                outputFiles.push({name: name, bytes: bytes});
            }
            

        };
        
        return outputFiles;
    }

    async jsonToC(pFile: FileData): Promise<Uint8Array> {
        let outputText: string = "";
        outputText += "#include <stdio.h>\n"
        outputText += "#include <stdbool.h>\n\n\n"

        const structName = "jsonObject";
        let isValidJson: boolean = false;
        let bytes: Uint8Array<ArrayBufferLike> = pFile.bytes;
        let jsonStr: string = "";
        bytes.forEach((byte) => {
            jsonStr += String.fromCharCode(byte);
        });
        let jsonObj: Object = {};
        try {
            jsonObj = JSON.parse(jsonStr);
            isValidJson = true;
        } catch (err) {
            console.error(`${pFile.name} is not a valid JSON file.`);
        }

        if (isValidJson) {
            outputText += await this.createStruct(structName, jsonObj, 0);
        }

        outputText += "\n\nint main(int argc, char** argv) {\n"

        outputText += "\n";
        let varName: string = `${structName}Var`;
        outputText += `\t${structName} ${varName};\n`;
        outputText += await this.assignValues(varName, jsonObj);
        outputText += "\n";

        outputText += "\treturn 0;\n}";
        let encoder = new TextEncoder();
        bytes = new Uint8Array(encoder.encode(outputText));
        

        return bytes;
    }

    async cToJson(pFile: FileData): Promise<Uint8Array> {
        let result = new Uint8Array();
        let cStr: string = "";
        let resultObj: any = {};
        
        // Map of variable name, to either nested maps or JsonType
        let dataDictionary: any = {}
        let previousDicts: any[] = [dataDictionary];

        pFile.bytes.forEach((byte) => {
            cStr += String.fromCharCode(byte);
        });
        let lines: string[] = cStr.split("\n");
        const ASSIGNMENT_REGEX = /^(?!#)[^0-9]*\.[^0-9]*/;
        const DECLARATION_REGEX = /(?!(.+{$))(void\*|char\*|int|float|bool) .+/;
        const STRUCT_REGEX = /^(typedef struct|union)\s*{\s*$/
        const STRUCT_END_REGEX = /^}\s*.+$/;
        const ARRAY_REGEX = /(^.+)\[(\d+)\]$/;
        let previousLine: string = '';

        for (let line of lines) {
            line = line.trim();
            line = line.replaceAll(/;/g, '');
            // Remove potential double-spaces to make parsing easier
            line = line.replaceAll(/\s\s/g, ' ');
            if (line.match(STRUCT_REGEX)) {
                previousDicts.push(new Map());
            } else if (line.match(STRUCT_END_REGEX)) {
                let structName = line.replaceAll(/}|\s/g, '');
                // Type can not logically be undefined, but it calms the typescript compiler
                if (previousDicts.length > 1) {
                    let toAdd: any | undefined = previousDicts.pop();
                    let toAddTo: any | undefined;
                    // ensure that the base dict isn't removed when popping
                    if (previousDicts.length > 1) {
                        toAddTo = previousDicts.pop();
                    } else {
                        toAddTo = previousDicts[0];
                    }
                    if (toAddTo !== undefined) {
                        let index = previousDicts.length-1;
                        toAddTo[structName] = toAdd;
                        previousDicts[index] = toAddTo;
                        if (previousDicts.length === 1) {
                            dataDictionary = previousDicts[index];
                        }
                    }
                }
            }

            if (line.match(DECLARATION_REGEX)) {
                let lineSplit: string[] = line.split(' ');
                let dataType: JsonType.JsonType = JsonTypeFactory.fromCType(lineSplit[0]);
                let index = previousDicts.length-1;
                let varName = lineSplit[1];
                // regex with capture groups to capture if variable is array
                let matched = varName.match(ARRAY_REGEX);
                // if variable is array
                if (matched !== null) {
                    let toAdd = new JsonType.ListType(dataType);
                    varName = matched[1];
                    let numElementsStr: string = matched[2];
                    if (matched.length == 3) {
                        toAdd.setNumElements(Number(numElementsStr));
                    }
                    previousDicts[index][varName] = toAdd;
                } else {
                    previousDicts[index][varName] = dataType;
                }

            }

            if (line.match(ASSIGNMENT_REGEX)) {
                // remove whitespace characters
                line = line.replaceAll(/\s/g, '');
                let structSplitRegex: RegExp = /\.(?!\d)/;
                let subStructs: string[] = line.split(structSplitRegex);
                subStructs = subStructs.slice(1, subStructs.length);
                let operands = subStructs[subStructs.length-1].split("=");
                let varName = operands[0];
                let newVarValue = operands[1];
                subStructs = subStructs.slice(0, subStructs.length-1);
                let previousResult: any = resultObj;
                let selectedDataDict: any = dataDictionary;
                // Iterate to find struct to retrieve values from
                for (let structName of subStructs) {
                    // Create map if doesn't exist
                    if (!(structName in previousResult)) {
                        previousResult[structName] = {};
                    }
                    // select map
                    previousResult = previousResult[structName];
                    selectedDataDict = selectedDataDict[structName];
                }
                let matchedArray = varName.match(ARRAY_REGEX);
                let dataType: JsonType.JsonType | null = null;
                if (matchedArray) {
                    if (matchedArray.length === 3) {
                        varName = matchedArray[1];
                        let index = matchedArray[2];
                        dataType = selectedDataDict[varName];
                        if (dataType instanceof JsonType.ListType) {
                            dataType.convertValue(newVarValue, Number(index));
                        }
                    }
                } else {
                    dataType = selectedDataDict[varName];
                    if (dataType !== null) {
                        dataType.convertValue(newVarValue);
                    }
                }
                if (dataType !== null) {
                    previousResult = previousResult[varName] = dataType.value;
                }
            }
            previousLine = line;
        }

        let resultStr = JSON.stringify(resultObj, undefined, 4);
        let encoder = new TextEncoder();
        result = new Uint8Array(encoder.encode(resultStr));

        return result;
    }

    async createStruct(pKey: string, pObject: Object, pRecursionLevel: number): Promise<string> {
        let result: string = "";
        let indent: string = "\t".repeat(pRecursionLevel+1);
        let shortIndent: string = "\t".repeat(pRecursionLevel);
        let isUnion: boolean = false;
        if (pRecursionLevel > 0) {
            result += "\tunion {\n";
            isUnion = true;
        } else {
            result += "typedef struct {\n";
        }

        // Iterate through keys of object
        let key: keyof Object;
        for (key in pObject) {
            let val: any = pObject[key];

            let valType: JsonType.JsonType = JsonTypeFactory.fromAny(val);
            if (!(valType instanceof JsonType.InvalidType)) {
                result += indent;
                if (isUnion) {
                    result += "\t";
                }
                if (valType instanceof JsonType.ListType) {
                    let valLength: number = val.length;
                    result += valType.type.toCType() + " " + key + `[${valLength}];\n`;
                } else if (valType instanceof JsonType.ObjectType) {
                    result += await this.createStruct(key, val, pRecursionLevel+1);
                } else {
                    valType.value = val;
                    result += valType.toCType() + " " + key + ";\n";
                }
            }
        }

        result += shortIndent + "} " + pKey + ";\n";
        return result;
    }

    async assignValues(pKey: string, pObject: Object): Promise<string> {
        let result: string = "";
        let key: keyof Object;
        for (key in pObject) {
            let val = pObject[key];
            let objType: JsonType.JsonType = JsonTypeFactory.fromAny(val);
            if (!(objType instanceof JsonType.InvalidType)) {
                if (objType instanceof JsonType.ListType) {
                    let i = 0;
                    for (let element in val) {
                        result += `\t${pKey}.${key}[${i}] = ${element};\n`
                        i++;
                    }
                } else if (objType instanceof JsonType.ObjectType) {
                    result += await this.assignValues(`${pKey}.${key}`, val);
                } else if (objType instanceof JsonType.StringType) {
                    result += `\t${pKey}.${key} = "${val}";\n`;
                } else if (objType instanceof JsonType.UndefinedType) {
                    result += `\t${pKey}.${key} = (void*) (${val});\n`;
                } else if (objType.isNumericType) {
                    result += `\t${pKey}.${key} = ${val};\n`;  
                }
            }
        }
        return result;
    }

}