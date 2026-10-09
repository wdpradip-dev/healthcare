import type { NotificationCategory } from "./notifications.types";

/** The docs/22-NOTIFICATIONS.md "Event catalog" table, verbatim. */
export type NotificationEvent =
  | "NEW_DEVICE_LOGIN"
  | "PASSWORD_CHANGED"
  | "APPOINTMENT_BOOKED"
  | "APPOINTMENT_RESCHEDULED"
  | "APPOINTMENT_CANCELLED"
  | "APPOINTMENT_REMINDER"
  | "CHECKED_IN"
  | "CONSULTATION_COMPLETE"
  | "PRESCRIPTION_ISSUED"
  | "REPORT_READY"
  | "STAFF_INVITED"
  | "STAFF_DEACTIVATED"
  | "REFRESH_TOKEN_REUSE";

export type DeliveryChannel = "PUSH" | "EMAIL";

interface EventDefinition {
  channels: DeliveryChannel[];
  /** `undefined` = transactional/security — always sent, preferences never consulted. */
  category?: NotificationCategory;
}

/** Channels are the *external* ones — every event additionally gets a durable `IN_APP` row (docs/22). */
export const EVENT_CATALOG: Record<NotificationEvent, EventDefinition> = {
  NEW_DEVICE_LOGIN: { channels: ["EMAIL"] },
  PASSWORD_CHANGED: { channels: ["EMAIL"] },
  APPOINTMENT_BOOKED: { channels: ["PUSH", "EMAIL"], category: "appointments" },
  APPOINTMENT_RESCHEDULED: { channels: ["PUSH", "EMAIL"], category: "appointments" },
  APPOINTMENT_CANCELLED: { channels: ["PUSH", "EMAIL"], category: "appointments" },
  APPOINTMENT_REMINDER: { channels: ["PUSH"], category: "appointments" },
  CHECKED_IN: { channels: ["PUSH"], category: "appointments" },
  CONSULTATION_COMPLETE: { channels: ["PUSH", "EMAIL"], category: "consultations" },
  PRESCRIPTION_ISSUED: { channels: ["PUSH", "EMAIL"], category: "prescriptions" },
  REPORT_READY: { channels: ["PUSH", "EMAIL"], category: "reports" },
  STAFF_INVITED: { channels: ["EMAIL"] },
  STAFF_DEACTIVATED: { channels: ["EMAIL"] },
  REFRESH_TOKEN_REUSE: { channels: ["EMAIL"] },
};

/** Built-in fallback text, used whenever no `NotificationTemplate` row overrides it (docs/13). `{{var}}` interpolation. */
export const DEFAULT_TEMPLATES: Record<NotificationEvent, { subject?: string; title: string; body: string }> = {
  NEW_DEVICE_LOGIN: { subject: "New sign-in to your account", title: "New sign-in detected", body: "A new sign-in to your account was detected from {{deviceName}}. If this wasn't you, reset your password immediately." },
  PASSWORD_CHANGED: { subject: "Your password was changed", title: "Password changed", body: "Your password was just changed. If you didn't make this change, contact support immediately." },
  APPOINTMENT_BOOKED: { subject: "Appointment confirmed", title: "Appointment confirmed", body: "Your appointment with {{doctorName}} on {{appointmentTime}} is confirmed." },
  APPOINTMENT_RESCHEDULED: { subject: "Appointment rescheduled", title: "Appointment rescheduled", body: "Your appointment with {{doctorName}} has been moved to {{appointmentTime}}." },
  APPOINTMENT_CANCELLED: { subject: "Appointment cancelled", title: "Appointment cancelled", body: "Your appointment with {{doctorName}} on {{appointmentTime}} has been cancelled." },
  APPOINTMENT_REMINDER: { title: "Upcoming appointment", body: "Reminder: your appointment with {{doctorName}} is at {{appointmentTime}}." },
  CHECKED_IN: { title: "You're checked in", body: "You're checked in for your appointment with {{doctorName}}. We'll call you when it's your turn." },
  CONSULTATION_COMPLETE: { subject: "Your visit summary is ready", title: "Visit summary ready", body: "The summary from your visit with {{doctorName}} on {{appointmentTime}} is now available." },
  PRESCRIPTION_ISSUED: { subject: "Prescription issued", title: "Prescription issued", body: "{{doctorName}} issued you a new prescription. Open the app to view or download it." },
  REPORT_READY: { subject: "Your report is ready", title: "Report ready", body: "Your {{reportTitle}} report is ready to view." },
  STAFF_INVITED: { subject: "You've been invited to {{hospitalName}}", title: "You're invited", body: "You've been invited to join {{hospitalName}} on the Hospital Platform. Check your email to activate your account." },
  STAFF_DEACTIVATED: { subject: "Your account has been deactivated", title: "Account deactivated", body: "Your account at {{hospitalName}} has been deactivated. Contact your hospital administrator with questions." },
  REFRESH_TOKEN_REUSE: { subject: "Security alert on your account", title: "Security alert", body: "We detected unusual activity on your account and signed out all your devices as a precaution. Please sign in again." },
};

export function interpolate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => variables[key] ?? match);
}
