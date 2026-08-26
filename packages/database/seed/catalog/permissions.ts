import { PERMISSIONS, type Permission } from "@hospital/validation";

/**
 * Descriptions for the canonical permission catalog — docs/02-PERSONAS-AND-ROLES.md
 * is the source of truth for the key list itself (imported from
 * @hospital/validation, not re-typed here, so the two can never drift).
 */
const DESCRIPTIONS: Record<Permission, string> = {
  "hospitals.read": "View hospital records across the platform (Super Admin only).",
  "hospitals.write": "Create/suspend/update hospitals (Super Admin only, tenant onboarding).",
  "branches.read": "View branch records.",
  "branches.write": "Create/update/deactivate branches.",
  "departments.read": "View department records.",
  "departments.write": "Create/update/deactivate departments.",
  "users.read": "View user accounts.",
  "users.manage": "Invite, deactivate, and assign roles to user accounts.",
  "roles.read": "View roles and their permission bundles.",
  "roles.manage": "Create/edit custom roles and their permission bundles (Super Admin only).",
  "permissions.read": "View the platform permission catalog (Super Admin only).",
  "patients.read": "View patient demographic/profile records.",
  "patients.write": "Create/update patient demographic/profile records.",
  "doctors.read": "View doctor profiles.",
  "doctors.write": "Create/update doctor profiles and department assignments.",
  "staff.read": "View non-doctor staff profiles.",
  "staff.write": "Create/update/deactivate non-doctor staff profiles.",
  "schedules.read": "View doctor schedules and computed availability.",
  "schedules.write": "Create/update doctor schedule templates and exceptions.",
  "appointments.read": "View appointments.",
  "appointments.create": "Book a new appointment.",
  "appointments.update": "Reschedule or update an appointment.",
  "appointments.cancel": "Cancel an appointment.",
  "appointments.checkin": "Check a patient in for their appointment.",
  "consultations.read": "View consultation records.",
  "consultations.write": "Author/update/complete a consultation.",
  "medical_records.read": "View a patient's medical history (conditions, allergies, notes).",
  "medical_records.write": "Record vitals, conditions, allergies, and clinical notes.",
  "prescriptions.read": "View prescriptions.",
  "prescriptions.write": "Issue a prescription.",
  "lab_orders.read": "View lab/imaging orders.",
  "lab_orders.write": "Create a lab/imaging order.",
  "reports.read": "View lab/imaging reports.",
  "reports.upload": "Upload a raw report file and/or structured values.",
  "reports.verify": "Human-review and release a report (including any AI-assisted summary decision).",
  "documents.read": "View documents.",
  "documents.upload": "Upload a document.",
  "notifications.read": "View one's own notifications (always SELF scope).",
  "notifications.manage": "Manage notification templates and view delivery health.",
  "analytics.read": "View operational analytics dashboards.",
  "audit_logs.read": "View the audit log.",
  "settings.manage": "View/update hospital settings (booking policy, etc.).",
};

export interface PermissionSeed {
  key: Permission;
  resource: string;
  action: string;
  description: string;
}

export const PERMISSION_SEEDS: PermissionSeed[] = PERMISSIONS.map((key) => {
  const [resource, action] = key.split(".") as [string, string];
  return { key, resource, action, description: DESCRIPTIONS[key] };
});
