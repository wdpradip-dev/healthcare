import { listNotificationsQuerySchema, registerPushTokenSchema, updateNotificationPreferencesSchema, upsertNotificationTemplateSchema } from "./notifications";

describe("listNotificationsQuerySchema", () => {
  it("parses read=true/false into a boolean, and leaves it undefined otherwise", () => {
    expect(listNotificationsQuerySchema.parse({ read: "true" }).read).toBe(true);
    expect(listNotificationsQuerySchema.parse({ read: "false" }).read).toBe(false);
    expect(listNotificationsQuerySchema.parse({}).read).toBeUndefined();
  });

  it("rejects a non-boolean value", () => {
    expect(listNotificationsQuerySchema.safeParse({ read: "maybe" }).success).toBe(false);
  });
});

describe("updateNotificationPreferencesSchema", () => {
  it("accepts a partial update with only some fields", () => {
    expect(updateNotificationPreferencesSchema.safeParse({ push: false }).success).toBe(true);
    expect(updateNotificationPreferencesSchema.safeParse({ categories: { appointments: false } }).success).toBe(true);
    expect(updateNotificationPreferencesSchema.safeParse({}).success).toBe(true);
  });

  it("rejects an unknown category", () => {
    expect(updateNotificationPreferencesSchema.safeParse({ categories: { billing: false } }).success).toBe(false);
  });
});

describe("registerPushTokenSchema", () => {
  it("requires a non-empty token", () => {
    expect(registerPushTokenSchema.safeParse({ pushToken: "ExponentPushToken[x]" }).success).toBe(true);
    expect(registerPushTokenSchema.safeParse({ pushToken: "" }).success).toBe(false);
  });
});

describe("upsertNotificationTemplateSchema", () => {
  it("requires a body and a valid channel", () => {
    expect(upsertNotificationTemplateSchema.safeParse({ channel: "EMAIL", body: "Hi" }).success).toBe(true);
    expect(upsertNotificationTemplateSchema.safeParse({ channel: "SMS", body: "Hi" }).success).toBe(false);
    expect(upsertNotificationTemplateSchema.safeParse({ channel: "EMAIL", body: "" }).success).toBe(false);
  });
});
