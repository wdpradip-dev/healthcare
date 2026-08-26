import { SYSTEM_ROLES, type Permission, type PermissionScope, type SystemRole } from "@hospital/validation";

/**
 * System role -> permission grant table. Transcribed exactly from the per-role
 * "Permissions" lists and the "Role -> Permission matrix" in
 * docs/02-PERSONAS-AND-ROLES.md — that document is authoritative; if this ever
 * needs to change, update the doc first.
 *
 * `notifications.read` is SELF for every role (see docs/02-PERSONAS-AND-ROLES.md
 * "Authorization model summary" note) rather than each role's stated default scope.
 */
export interface RolePermissionGrant {
  permission: Permission;
  scope: PermissionScope;
}

const PATIENT: RolePermissionGrant[] = [
  { permission: "patients.read", scope: "SELF" },
  { permission: "patients.write", scope: "SELF" },
  { permission: "doctors.read", scope: "PLATFORM" },
  { permission: "departments.read", scope: "PLATFORM" },
  { permission: "branches.read", scope: "PLATFORM" },
  { permission: "schedules.read", scope: "PLATFORM" },
  { permission: "appointments.read", scope: "SELF" },
  { permission: "appointments.create", scope: "SELF" },
  { permission: "appointments.update", scope: "SELF" },
  { permission: "appointments.cancel", scope: "SELF" },
  { permission: "medical_records.read", scope: "SELF" },
  { permission: "prescriptions.read", scope: "SELF" },
  { permission: "reports.read", scope: "SELF" },
  { permission: "documents.read", scope: "SELF" },
  { permission: "documents.upload", scope: "SELF" },
  { permission: "notifications.read", scope: "SELF" },
];

const DOCTOR: RolePermissionGrant[] = [
  { permission: "patients.read", scope: "ASSIGNED" },
  { permission: "appointments.read", scope: "ASSIGNED" },
  { permission: "appointments.update", scope: "ASSIGNED" },
  { permission: "appointments.checkin", scope: "SELF" },
  { permission: "schedules.read", scope: "SELF" },
  { permission: "schedules.write", scope: "SELF" },
  { permission: "consultations.read", scope: "ASSIGNED" },
  { permission: "consultations.write", scope: "ASSIGNED" },
  { permission: "medical_records.read", scope: "ASSIGNED" },
  { permission: "medical_records.write", scope: "ASSIGNED" },
  { permission: "prescriptions.read", scope: "ASSIGNED" },
  { permission: "prescriptions.write", scope: "ASSIGNED" },
  { permission: "lab_orders.read", scope: "ASSIGNED" },
  { permission: "lab_orders.write", scope: "ASSIGNED" },
  { permission: "reports.read", scope: "ASSIGNED" },
  { permission: "reports.upload", scope: "ASSIGNED" },
  { permission: "reports.verify", scope: "ASSIGNED" },
  { permission: "documents.read", scope: "ASSIGNED" },
  { permission: "documents.upload", scope: "ASSIGNED" },
  { permission: "notifications.read", scope: "SELF" },
];

const NURSE: RolePermissionGrant[] = [
  { permission: "patients.read", scope: "BRANCH" },
  { permission: "appointments.read", scope: "BRANCH" },
  { permission: "appointments.checkin", scope: "BRANCH" },
  { permission: "schedules.read", scope: "BRANCH" },
  { permission: "consultations.read", scope: "BRANCH" },
  { permission: "medical_records.read", scope: "BRANCH" },
  { permission: "medical_records.write", scope: "BRANCH" },
  { permission: "prescriptions.read", scope: "BRANCH" },
  { permission: "lab_orders.read", scope: "BRANCH" },
  { permission: "reports.read", scope: "BRANCH" },
  { permission: "documents.read", scope: "BRANCH" },
  { permission: "documents.upload", scope: "BRANCH" },
  { permission: "notifications.read", scope: "SELF" },
];

const RECEPTIONIST: RolePermissionGrant[] = [
  { permission: "patients.read", scope: "BRANCH" },
  { permission: "patients.write", scope: "BRANCH" },
  { permission: "doctors.read", scope: "BRANCH" },
  { permission: "departments.read", scope: "BRANCH" },
  { permission: "schedules.read", scope: "BRANCH" },
  { permission: "appointments.read", scope: "BRANCH" },
  { permission: "appointments.create", scope: "BRANCH" },
  { permission: "appointments.update", scope: "BRANCH" },
  { permission: "appointments.cancel", scope: "BRANCH" },
  { permission: "appointments.checkin", scope: "BRANCH" },
  { permission: "notifications.read", scope: "SELF" },
];

const ADMIN: RolePermissionGrant[] = [
  { permission: "branches.read", scope: "HOSPITAL" },
  { permission: "branches.write", scope: "HOSPITAL" },
  { permission: "departments.read", scope: "HOSPITAL" },
  { permission: "departments.write", scope: "HOSPITAL" },
  { permission: "users.read", scope: "HOSPITAL" },
  { permission: "users.manage", scope: "HOSPITAL" },
  { permission: "roles.read", scope: "HOSPITAL" },
  { permission: "patients.read", scope: "HOSPITAL" },
  { permission: "patients.write", scope: "HOSPITAL" },
  { permission: "doctors.read", scope: "HOSPITAL" },
  { permission: "doctors.write", scope: "HOSPITAL" },
  { permission: "staff.read", scope: "HOSPITAL" },
  { permission: "staff.write", scope: "HOSPITAL" },
  { permission: "schedules.read", scope: "HOSPITAL" },
  { permission: "schedules.write", scope: "HOSPITAL" },
  { permission: "appointments.read", scope: "HOSPITAL" },
  { permission: "appointments.create", scope: "HOSPITAL" },
  { permission: "appointments.update", scope: "HOSPITAL" },
  { permission: "appointments.cancel", scope: "HOSPITAL" },
  { permission: "appointments.checkin", scope: "HOSPITAL" },
  { permission: "consultations.read", scope: "HOSPITAL" },
  { permission: "medical_records.read", scope: "HOSPITAL" },
  { permission: "prescriptions.read", scope: "HOSPITAL" },
  { permission: "reports.read", scope: "HOSPITAL" },
  { permission: "documents.read", scope: "HOSPITAL" },
  { permission: "notifications.read", scope: "SELF" },
  { permission: "notifications.manage", scope: "HOSPITAL" },
  { permission: "analytics.read", scope: "HOSPITAL" },
  { permission: "audit_logs.read", scope: "HOSPITAL" },
  { permission: "settings.manage", scope: "HOSPITAL" },
];

/**
 * SUPER_ADMIN holds every catalog permission at PLATFORM scope — populated in
 * seedRoles() from the full permission list rather than hand-duplicated here,
 * so it can never silently fall out of sync as new permissions are added.
 */
const SUPER_ADMIN: RolePermissionGrant[] = [];

export const ROLE_GRANTS: Record<SystemRole, RolePermissionGrant[]> = {
  PATIENT,
  DOCTOR,
  NURSE,
  RECEPTIONIST,
  ADMIN,
  SUPER_ADMIN,
};

export const SYSTEM_ROLE_KEYS = SYSTEM_ROLES;
