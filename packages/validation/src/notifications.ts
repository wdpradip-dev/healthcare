import { z } from "zod";

/** `/notifications` DTOs — docs/15-API-SPECIFICATION.md, docs/22-NOTIFICATIONS.md. */

/** The event catalog's category groupings (docs/22 "Preferences": "one toggle covers booked/rescheduled/cancelled/reminder"). */
export const notificationCategorySchema = z.enum(["appointments", "consultations", "prescriptions", "reports"]);

export const listNotificationsQuerySchema = z.object({
  read: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

export const updateNotificationPreferencesSchema = z.object({
  push: z.boolean().optional(),
  email: z.boolean().optional(),
  categories: z.record(notificationCategorySchema, z.boolean()).optional(),
});

export type UpdateNotificationPreferencesInput = z.infer<typeof updateNotificationPreferencesSchema>;

/** Registers this device's Expo push token for the caller (docs/13 "DeviceSession.pushToken"). */
export const registerPushTokenSchema = z.object({
  pushToken: z.string().min(1, "pushToken is required."),
});

export type RegisterPushTokenInput = z.infer<typeof registerPushTokenSchema>;

export const upsertNotificationTemplateSchema = z.object({
  channel: z.enum(["PUSH", "EMAIL", "IN_APP"]),
  subject: z.string().max(200).optional(),
  body: z.string().min(1, "Template body is required.").max(2000),
});

export type UpsertNotificationTemplateInput = z.infer<typeof upsertNotificationTemplateSchema>;
