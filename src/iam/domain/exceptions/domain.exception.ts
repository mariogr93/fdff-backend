export class DomainException extends Error {
    constructor(public readonly message: string, public readonly statusCode: number = 500) {
        super(message);
        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }
}