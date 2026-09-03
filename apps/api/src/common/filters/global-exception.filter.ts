import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from "@nestjs/common";
import type { Response } from "express";
import { DomainException, httpStatusForErrorCode } from "@hospital/shared";

/**
 * Maps every thrown error to the response envelope in
 * docs/15-API-SPECIFICATION.md / docs/28-ERROR-HANDLING.md:
 *   { "error": { "code", "message", "details" } }
 *
 * - `DomainException` (thrown by services, per docs/44-CODING-STANDARDS.md
 *   "services never construct raw HTTP responses") maps 1:1 to its code.
 * - Nest's own `HttpException` (thrown by framework internals, e.g. a
 *   malformed route) maps to a best-effort code.
 * - Anything else is logged in full server-side and returned to the client
 *   as a generic `INTERNAL_ERROR` — stack traces and internals never leak.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof DomainException) {
      response.status(exception.httpStatus).json({
        error: {
          code: exception.code,
          message: exception.message,
          ...(exception.details ? { details: exception.details } : {}),
        },
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      response.status(status).json({
        error: {
          code: status === 404 ? "NOT_FOUND" : status === 403 ? "FORBIDDEN" : "VALIDATION_ERROR",
          message: exception.message,
        },
      });
      return;
    }

    this.logger.error("Unhandled exception", exception instanceof Error ? exception.stack : exception);
    response.status(httpStatusForErrorCode("INTERNAL_ERROR")).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong. Please try again.",
      },
    });
  }
}
