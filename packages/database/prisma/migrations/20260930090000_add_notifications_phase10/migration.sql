-- Phase 10 (docs/22-NOTIFICATIONS.md, docs/41-TASKS.md T-901 series): all
-- additive (docs/38-DATABASE-MIGRATIONS.md "Additive-first").

-- User notification preferences — null = every channel/category enabled.
ALTER TABLE "users" ADD COLUMN "notification_preferences" JSONB;

-- Expo push token registered by the mobile app for this device.
ALTER TABLE "device_sessions" ADD COLUMN "push_token" TEXT;

-- Delivery attempt tracking for the Admin "Delivery Health" view.
ALTER TABLE "notifications" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "notifications" ADD COLUMN "last_error" TEXT;

-- Per (hospital, event key, channel) template override. hospital_id = null is
-- the platform default every hospital falls back to; a missing row for a
-- given key/channel falls back further to the built-in default text shipped
-- in code (packages/database ships no seed rows for this table).
CREATE TABLE "notification_templates" (
    "id" UUID NOT NULL,
    "hospital_id" UUID,
    "key" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_templates_hospital_id_key_channel_key" ON "notification_templates"("hospital_id", "key", "channel");

ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
