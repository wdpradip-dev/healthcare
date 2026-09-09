-- Additive, defaulted column (docs/38-DATABASE-MIGRATIONS.md "Additive-first")
-- — the IANA zone every DoctorSchedule/ScheduleException wall-clock time for
-- a hospital's doctors is interpreted in when computing availability
-- (docs/19-APPOINTMENT-ENGINE.md, Phase 6).
ALTER TABLE "hospital_settings" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'UTC';
