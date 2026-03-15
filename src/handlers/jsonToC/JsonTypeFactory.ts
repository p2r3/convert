import { JsonType } from "./JsonType";

export default class JsonTypeFactory {
    static fromCType(pCType: string): JsonType.JsonType {
        let result = new JsonType.InvalidType();
        switch (pCType) {
            case "char*":
                result = new JsonType.StringType();
                break;
            case "int":
                result = new JsonType.IntType();
                break;
            case "float":
                result = new JsonType.FloatType();
                break;
            case "bool":
                result = new JsonType.BoolType();
                break;
            case "void*":
                result = new JsonType.UndefinedType();
                break;
            default:
                throw `Invalid C type: ${pCType}`;
            
        }
        return result;
    }

    static fromAny(pVal: any): JsonType.JsonType {
        let result: JsonType.JsonType = new JsonType.InvalidType();
        if ((pVal instanceof String) || (typeof pVal === "string")) {
            result = new JsonType.StringType();
        } else if ((pVal instanceof Boolean) || (typeof pVal === "boolean")) {
            result = new JsonType.BoolType();
        } else if (!isNaN(Number(pVal))) {
            if (Number.isInteger(Number(pVal))) {
                result = new JsonType.IntType();
                console.debug("result=");
                console.debug(result);
            } else {
                result = new JsonType.FloatType();
            }
        }
        else if (Array.isArray(pVal)) {
            if (pVal.length > 0) {
                // check that all values in list are of same type
                if (pVal.every(item => typeof item == typeof pVal[0])) {
                    let subType: JsonType.JsonType = this.fromAny(pVal[0]);
                    result = new JsonType.ListType(subType);
                }
            } else {
                result = new JsonType.ListType(new JsonType.UndefinedType());
            }
        } else if ((typeof pVal === "object" ) && (pVal !== null) && !(Array.isArray(pVal))) {
            result = new JsonType.ObjectType();
        }

        return result;
    }
}