export type NotificationCategory = "appointments" | "consultations" | "prescriptions" | "reports";

/** Stored on `User.notificationPreferences` (docs/13); `null`/a missing key defaults to enabled. */
export interface NotificationPreferences {
  push?: boolean;
  email?: boolean;
  categories?: Partial<Record<NotificationCategory, boolean>>;
}
