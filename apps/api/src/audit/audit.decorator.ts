import { SetMetadata } from "@nestjs/common";

export const AUDIT_METADATA_KEY = "auditEvent";

export interface AuditMetadata {
  action: string;
  resourceType: string;
}

/**
 * Opt-in scaffold for the simple case: "this mutation succeeded, log it,"
 * with the resource id taken from the response body's `id` field (falling
 * back to the route's `:id` param). Events needing before/after diffs or a
 * resourceId that isn't the response body's own id call `AuditService.record()`
 * directly instead — see docs/24-AUDIT-LOGGING.md and audit.service.ts.
 */
export const Audit = (metadata: AuditMetadata) => SetMetadata(AUDIT_METADATA_KEY, metadata);
