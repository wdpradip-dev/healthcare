import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { Observable, tap } from "rxjs";
import { AuditService } from "./audit.service";
import { AUDIT_METADATA_KEY, type AuditMetadata } from "./audit.decorator";

/**
 * Companion to `@Audit(...)` — see that file's docstring for when to use
 * this versus a direct `AuditService.record()` call. Fires only after the
 * handler completes successfully (a thrown exception never produces an
 * audit row for an action that didn't actually happen).
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const metadata = this.reflector.get<AuditMetadata | undefined>(AUDIT_METADATA_KEY, context.getHandler());
    if (!metadata) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();

    return next.handle().pipe(
      tap((responseBody: unknown) => {
        const resourceId =
          (isRecordWithId(responseBody) ? responseBody.id : undefined) ??
          (typeof request.params?.id === "string" ? request.params.id : null);

        void this.auditService.record({
          hospitalId: request.user?.hospitalId ?? null,
          actorUserId: request.user?.sub ?? null,
          actorRole: request.user?.roles?.[0] ?? "SYSTEM",
          action: metadata.action,
          resourceType: metadata.resourceType,
          resourceId: resourceId ?? null,
          ipAddress: request.ip ?? null,
          userAgent: request.headers["user-agent"] ?? null,
        });
      }),
    );
  }
}

function isRecordWithId(value: unknown): value is { id: string } {
  return typeof value === "object" && value !== null && "id" in value && typeof (value as { id: unknown }).id === "string";
}
