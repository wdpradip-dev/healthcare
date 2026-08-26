/**
 * Canonical permission catalog — mirrors docs/02-PERSONAS-AND-ROLES.md exactly.
 * That document is the source of truth: add a permission there first, then here,
 * then to the seed data (docs/36-SEED-DATA.md / packages/database/seed).
 */
export const PERMISSIONS = [
  "hospitals.read",
  "hospitals.write",
  "branches.read",
  "branches.write",
  "departments.read",
  "departments.write",
  "users.read",
  "users.manage",
  "roles.read",
  "roles.manage",
  "permissions.read",

  "patients.read",
  "patients.write",
  "doctors.read",
  "doctors.write",
  "staff.read",
  "staff.write",

  "schedules.read",
  "schedules.write",
  "appointments.read",
  "appointments.create",
  "appointments.update",
  "appointments.cancel",
  "appointments.checkin",

  "consultations.read",
  "consultations.write",
  "medical_records.read",
  "medical_records.write",
  "prescriptions.read",
  "prescriptions.write",
  "lab_orders.read",
  "lab_orders.write",
  "reports.read",
  "reports.upload",
  "reports.verify",
  "documents.read",
  "documents.upload",

  "notifications.read",
  "notifications.manage",
  "analytics.read",
  "audit_logs.read",
  "settings.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** The five permission-scope levels — see docs/02-PERSONAS-AND-ROLES.md "Authorization model summary". */
export const PERMISSION_SCOPES = [
  "SELF",
  "ASSIGNED",
  "BRANCH",
  "HOSPITAL",
  "PLATFORM",
] as const;

export type PermissionScope = (typeof PERMISSION_SCOPES)[number];

/** The six system roles — see docs/02-PERSONAS-AND-ROLES.md. */
export const SYSTEM_ROLES = [
  "PATIENT",
  "DOCTOR",
  "NURSE",
  "RECEPTIONIST",
  "ADMIN",
  "SUPER_ADMIN",
] as const;

export type SystemRole = (typeof SYSTEM_ROLES)[number];

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}
