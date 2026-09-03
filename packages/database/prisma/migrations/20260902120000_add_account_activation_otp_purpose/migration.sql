-- Additive enum value (docs/38-DATABASE-MIGRATIONS.md "Enum changes: adding
-- a value is additive-safe") — supports the invited-staff account-activation
-- flow (docs/16-AUTHENTICATION.md "Staff activation"), which needs its own
-- OtpChallenge purpose distinct from REGISTRATION/PASSWORD_RESET so an
-- activation code can never be replayed against the wrong flow.
ALTER TYPE "OtpPurpose" ADD VALUE 'ACCOUNT_ACTIVATION';
