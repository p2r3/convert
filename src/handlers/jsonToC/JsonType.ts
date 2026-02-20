export namespace JsonType {
    export interface JsonType {
        value: any;
        toCType(): string;
        convertValue(pValue: string): void;
        isNumericType: boolean;
    }

    export class IntType implements JsonType {
        value: any;
        isNumericType: boolean = true;
        convertValue(pValue: string) {
            this.value = Number(pValue);
        }

        toCType(): string {
            return "int";
        }
    }

    export class FloatType implements JsonType {
        value: any;
        isNumericType: boolean = true;
        convertValue(pValue: string) {
            this.value = Number(pValue);
        }

        toCType(): string {
            return "float";
        }
    }

    export class BoolType implements JsonType {
        value: any;
        isNumericType: boolean = true;
        convertValue(pValue: string) {
            this.value = Boolean(pValue);
        }
        toCType(): string {
            return "bool";
        }
    }

    export class StringType implements JsonType {
        value: any;
        isNumericType: boolean = false;
        convertValue(pValue: string) {
            this.value = pValue.replaceAll('"', '');
        }
        toCType(): string {
            return "char*";
        }
    }

    export class ListType implements JsonType {
        
        numElements: number;
        type: JsonType;
        value: any;
        isNumericType: boolean = false;
        
        constructor(pType: JsonType, pNumElements?: number) {
            if (pNumElements === undefined) {
                this.numElements = 0;
            } else {
                this.numElements = pNumElements;
            }
            this.type = pType;
            this.value = new Array(this.numElements);
        }

        setNumElements(pNumElements: number) {
            this.numElements = pNumElements;
        }

        toCType(): string {
            return this.type.toCType();
        }

        
        convertValue(pValue: string, pIndex?: number) {
            if (pIndex !== undefined) {
                this.value[pIndex] = this.type.convertValue(pValue);
            }
        }
    }

    export class ObjectType implements JsonType {
        value: any;
        isNumericType: boolean = false;
        toCType(): string {throw "Unable to convert ObjectType to C type";}
        convertValue(pValue: string): void {}
    }

    export class InvalidType implements JsonType {
        value: any;
        isNumericType: boolean = false;
        toCType(): string {
            return "void*";
        }
        convertValue(pValue: string): void {
            this.value = pValue;
        }
    }

    export class UndefinedType implements JsonType {
        value: any;
        isNumericType: boolean = false;
        toCType(): string {
            return "void*";
        }
        convertValue(pValue: string): void {
            this.value = pValue;
        }
    }
}