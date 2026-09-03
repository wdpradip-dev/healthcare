import { Injectable } from "@nestjs/common";
import type { Prisma } from "@hospital/database";
import { PrismaService } from "../prisma/prisma.service";

export interface RecordAuditEventInput {
  hospitalId?: string | null;
  actorUserId?: string | null;
  actorRole: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  beforeState?: Prisma.InputJsonValue;
  afterState?: Prisma.InputJsonValue;
  ipAddress?: string | null;
  userAgent?: string | null;
  reasonCode?: string | null;
}

/**
 * Writes to the append-only `AuditLog` table (docs/24-AUDIT-LOGGING.md). No
 * update/delete method exists here on purpose — there is no application
 * code path that should ever modify an audit row after it's written.
 *
 * Called directly by services for security/auth events (register, login,
 * refresh-reuse, ...) where the call site already has full context. A
 * generic `@Audit(...)` decorator + interceptor (audit.interceptor.ts) is
 * also available for the simpler "this mutation succeeded, log it" case that
 * later CRUD-heavy modules (Phase 4+) can opt into instead of a direct call.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordAuditEventInput): Promise<void> {
    await this.prisma.client.auditLog.create({
      data: {
        hospitalId: input.hospitalId ?? null,
        actorUserId: input.actorUserId ?? null,
        actorRole: input.actorRole,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
        beforeState: input.beforeState,
        afterState: input.afterState,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        reasonCode: input.reasonCode ?? null,
      },
    });
  }
}
