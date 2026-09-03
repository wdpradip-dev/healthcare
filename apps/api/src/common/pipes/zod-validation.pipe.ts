import { PipeTransform } from "@nestjs/common";
import type { ZodTypeAny } from "zod";
import { DomainException, type ValidationDetail } from "@hospital/shared";

/**
 * Validates a request body/query/params against a `@hospital/validation` Zod
 * schema — the single source of truth for a DTO shape shared with client
 * forms (docs/44-CODING-STANDARDS.md). Failures become `VALIDATION_ERROR`
 * with per-field details, per docs/28-ERROR-HANDLING.md, before the request
 * ever reaches a service.
 */
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodTypeAny) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const details: ValidationDetail[] = result.error.issues.map((issue) => ({
        field: issue.path.join(".") || "(root)",
        message: issue.message,
      }));
      throw new DomainException("VALIDATION_ERROR", "One or more fields are invalid.", details);
    }
    return result.data;
  }
}
