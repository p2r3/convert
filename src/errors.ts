// Custom Error types
// import { BadMagicError, EOFError, InitializationError } from "src/errors.ts";
export class BadMagicError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "BadMagicError";
    }
}
export class EOFError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "EOFError";
    }
}
export class InitializationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "InitializationError";
    }
}