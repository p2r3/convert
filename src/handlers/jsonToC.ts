import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import {JsonType} from "./jsonToC/JsonType.ts";


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
                        bytes = await this.jsonToC(file);
                    }
                    break;
                case "json":
                    if (inputFormat.internal === "c") {
                        console.debug("converting from .json to .c")
                        bytes = await this.cToJson(file);
                    }
                break;
            }
            
            if (bytes.length > 0) {
                let name = file.name.split(".")[0] + "." + outputFormat.extension;
                outputFiles.push({name: name, bytes: bytes});
            }
            

        };
        console.debug(outputFiles);
        
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
        let resultJson: Map<string, any> = new Map();
        
        // Map of variable name, to either nested maps or JsonType
        let dataDictionary: Map<string, any | JsonType[]> = new Map();
        let previousDicts: Map<string, any | JsonType[]>[] = [dataDictionary];

        pFile.bytes.forEach((byte) => {
            cStr += String.fromCharCode(byte);
        });
        let lines: string[] = cStr.split("\n");
        let assignmentRegex = /^(?!#)[^0-9]*\.[^0-9]*/;
        let declarationRegex = /(?!(.+{$))(void\*|char\*|int|float|bool) .+/;
        let structRegex = /^(typedef struct|union)\s*{\s*$/
        let structEndRegex = /^}\s*.+$/;
        let previousLine: string = '';

        for (let line of lines) {
            line = line.trim();
            line = line.replaceAll(/;/g, '');
            // Remove potential double-spaces to make parsing easier
            line = line.replaceAll(/\s\s/g, ' ');
            if (line.match(structRegex)) {
                previousDicts.push(new Map());
            } else if (line.match(structEndRegex)) {
                let structName = line.replaceAll(/}|\s/g, '');
                // Type can not logically be undefined, but it calms the typescript compiler
                if (previousDicts.length > 1) {
                    let toAdd: Map<string, any> | undefined = previousDicts.pop();
                    let toAddTo: Map<string, any> | undefined;
                    // ensure that the base dict isn't removed when popping
                    if (previousDicts.length > 1) {
                        toAddTo = previousDicts.pop();
                    } else {
                        toAddTo = previousDicts[0];
                    }
                    if (toAddTo !== undefined) {
                        let index = previousDicts.length-1;
                        // Why the actual heck does this return a new object!?!?
                        previousDicts[index] = toAddTo.set(structName, toAdd);
                        if (previousDicts.length === 1) {
                            dataDictionary = previousDicts[index];
                        }
                    }
                }
            }

            if (line.match(declarationRegex)) {
                let lineSplit: string[] = line.split(' ');
                let dataType: JsonType = await this.cTypeToJson(lineSplit[0]);
                let index = previousDicts.length-1;
                let varName = lineSplit[1];
                // regex with capture groups to capture if variable is array
                let arrayPattern = /(^.+)\[(\d+)\]$/;
                let matched = varName.match(arrayPattern);
                if (matched !== null) {
                    previousDicts[index] = previousDicts[index].set(varName, [JsonType.LIST, dataType]);
                } else {
                    previousDicts[index] = previousDicts[index].set(varName, [dataType]);
                }

            }

            if (line.match(assignmentRegex)) {
                // remove whitespace characters
                line = line.replaceAll(/\s/g, '');
                let structSplitRegex: RegExp = /\.(?!\d)/;
                let subStructs: string[] = line.split(structSplitRegex);
                subStructs = subStructs.slice(1, subStructs.length);
                let operands = subStructs[subStructs.length-1].split("=");
                let varName = operands[0];
                subStructs = subStructs.slice(0, subStructs.length-1);
                let previousResult: Map<string, any> = resultJson;
                let selectedDataDict: Map<string, JsonType | any> = dataDictionary;
                // Iterate to find struct to retrieve values from
                for (let structName of subStructs) {
                    // Create map if doesn't exist
                    if (!previousResult.has(structName)) {
                        previousResult = previousResult.set(structName, new Map<string, any>());
                    }
                    // select map
                    previousResult = previousResult.get(structName);
                    selectedDataDict = selectedDataDict.get(structName);
                }

                previousResult = previousResult.set(varName, operands[1]);
                console.debug("resultJson=");
                console.debug(resultJson);
            }
            previousLine = line;
        }
        //console.debug(resultJson);

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
            let cTypeStr: string = "";
            let valType: JsonType[] = await this.getValueType(val);
            if (!(valType[0] instanceof InvalidType)) {
                result += indent;
                if (isUnion) {
                    result += "\t";
                }
                if (valType[0] instanceof ListType) {
                    let valLength: number = val.length;
                    result += await this.jsonToCType(valType[1]) + " " + key + `[${valLength}];\n`;
                } else if (valType[0] instanceof ObjectType) {
                    result += await this.createStruct(key, val, pRecursionLevel+1);
                } else {
                    result += await this.jsonToCType(valType[0]) + " " + key + ";\n";
                }
            }
            cTypeStr = await this.jsonToCType(valType[0]);
        }

        result += shortIndent + "} " + pKey + ";\n";
        return result;
    }

    async assignValues(pKey: string, pObject: Object): Promise<string> {
        let result: string = "";
        let key: keyof Object;
        for (key in pObject) {
            let val = pObject[key];
            let objType: JsonType.JsonType = await this.getValueType(val);
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

    async getValueType(pVal: any): Promise<JsonType.JsonType> {

    }

    async createListOfType(pType: JsonType): Promise<Array<any>> {
        let result: any[] = [];
        
        return result;
    }

}