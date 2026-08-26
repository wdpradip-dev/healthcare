import { ERROR_CODES, type ErrorCode } from "./error-codes";

export interface ValidationDetail {
  field: string;
  message: string;
}

/**
 * The one exception type domain services throw. Never construct a raw HTTP
 * response or throw a generic `Error` from a service — see docs/28-ERROR-HANDLING.md
 * and docs/44-CODING-STANDARDS.md. A NestJS global exception filter (apps/api,
 * added in Phase 3) maps this 1:1 to the response envelope in
 * docs/15-API-SPECIFICATION.md.
 */
export class DomainException extends Error {
  public readonly code: ErrorCode;
  public readonly httpStatus: number;
  public readonly details?: ValidationDetail[];

  constructor(code: ErrorCode, message: string, details?: ValidationDetail[]) {
    super(message);
    this.name = "DomainException";
    this.code = code;
    this.httpStatus = ERROR_CODES[code].httpStatus;
    this.details = details;
  }
}
