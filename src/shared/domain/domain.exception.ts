/**
 * Base class for business-rule violations, in the shared kernel because every
 * bounded context raises them and DomainExceptionFilter maps them to HTTP.
 *
 * There must be exactly one of these classes: @Catch(DomainException) matches
 * on class identity, so a second copy would silently stop being caught and
 * surface as a 500 with a leaked stack trace.
 */
export class DomainException extends Error {
  constructor(
    public readonly message: string,
    public readonly statusCode: number = 500,
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}
