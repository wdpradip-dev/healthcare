# 26 — Privacy and Data Protection

## Data classification

| Class | Examples | Handling |
|---|---|---|
| **Sensitive clinical (PHI-equivalent)** | Diagnoses, notes, vitals, prescriptions, lab/imaging results, allergies, conditions | Highest protection: permission+scope gated, fully audited on read and write, never included in analytics payloads, excluded from client-side error logs/crash reports |
| **Personal identifying (PII)** | Name, DOB, contact info, address, government ID documents | Permission-gated, audited on write, masked in logs (e.g. emails/phones partially masked in log lines, per [16-AUTHENTICATION.md](16-AUTHENTICATION.md)'s OTP audit example) |
| **Operational** | Appointment times, doctor schedules, department structure | Permission-gated per role but lower sensitivity; not independently audited on read (only on write) |
| **Aggregate/analytics** | Dashboard KPIs | No PII/PHI ever present by construction ([23-ANALYTICS-AND-REPORTING.md](23-ANALYTICS-AND-REPORTING.md)) |

## Minimum-necessary access

Roles are scoped to what their workflow requires, not to "everything that might be useful" — this is why, for example, Receptionist has no `medical_records.read` and Admin has read-only (not write) clinical access. See [02-PERSONAS-AND-ROLES.md](02-PERSONAS-AND-ROLES.md) for the full grant table; this principle is *why* that table is shaped the way it is, not an aspiration layered on top of it.

## Patient consent & rights

- **Access:** a patient can view their complete record via the Medical Dashboard (their own `SELF`-scope read is unrestricted within the platform).
- **Portability:** a patient can download their own prescriptions (PDF) and released reports/documents directly from the app. A full-record structured export ("download everything") is a Post-MVP addition; MVP supports per-item download, which covers the immediate need.
- **Correction:** a patient cannot directly edit clinical content (by design — clinical accuracy requires clinician authorship); they can request corrections through hospital support, tracked outside the app in MVP (no in-app "dispute this record" workflow yet — Post-MVP).
- **Deletion:** `POST /users/me/delete-request` initiates account deletion. Because clinical records are subject to hospital/regulatory retention obligations independent of the patient's wishes, deletion is implemented as: the `User`/`Patient` PII fields are anonymized (name → "Deleted Patient", contact info cleared) while clinical rows remain retained under the hospital's retention policy with the anonymized reference — this is a legally-motivated design point, not a corner cut, and is flagged as an open decision in the Stage 1 summary since exact retention periods are jurisdiction-dependent and need the user's input on target market/regulatory regime (see Unresolved Decisions).

## Data retention

- **Clinical records:** retained per hospital policy (jurisdiction-dependent; no default period is hardcoded — `HospitalSettings` is the natural extension point for a configurable retention period, schema-ready but not exposed in the MVP settings UI).
- **Audit logs:** retained indefinitely by default, per [24-AUDIT-LOGGING.md](24-AUDIT-LOGGING.md).
- **Refresh tokens / device sessions:** purged (hard-deleted, since they contain no clinical/PII value once expired) on a scheduled job once `expiresAt` has passed and `revokedAt` is set, typically after a short grace window (e.g. 30 days) for support/forensics purposes.
- **OTP challenges:** hard-deleted shortly after expiry (short-lived, no retention value).

## Data export controls

CSV/data export from admin list views is governed by the exporting user's existing `*.read` permission and scope — an export can never surface rows the same user couldn't already page through in the UI. Clinical-content exports (as opposed to operational/aggregate exports) are individually audited (`DATA_EXPORT`) with the exported resource type/filter criteria recorded, per [23-ANALYTICS-AND-REPORTING.md](23-ANALYTICS-AND-REPORTING.md).

## Third-party data sharing

Notification providers (push/email/SMS) and the AI report-assist provider receive only the minimum data needed to perform their function (e.g. the email provider receives an address + templated content, not a raw clinical payload; the AI provider receives de-identified-where-possible structured report values — see [27-MEDICAL-AI-SAFETY.md](27-MEDICAL-AI-SAFETY.md) for the specific AI data-handling stance). No third party receives standing database access; all integration is request/response through the provider-abstraction layer.

## Logging hygiene

Application logs (structured JSON logs per [35-MONITORING-AND-OBSERVABILITY.md](35-MONITORING-AND-OBSERVABILITY.md)) never include full clinical content, full patient PII, raw passwords/tokens, or file contents — log statements are reviewed in code review for this specifically, and a lint rule flags logging of known-sensitive object shapes (e.g. logging a full `Patient` or `ClinicalNote` object) as an error requiring an explicit allow-list of safe fields instead.

## Regulatory posture (resolved)

**This platform is a learning/demonstration project and is never populated with real patient data.** Every environment — local, development, staging, and any deployed "production" instance — runs exclusively on synthetic/fixture data per [36-SEED-DATA.md](36-SEED-DATA.md). This is a deliberate, user-confirmed scope decision, recorded as [ADR-014](43-ARCHITECTURE-DECISIONS.md), and it resolves what was previously an open question.

Consequently: the platform does **not** claim conformance with any named regulatory framework (HIPAA, GDPR, DPDP, etc.) and no Business Associate Agreement-equivalent posture is sought with third-party providers (Groq, Render, Supabase, Vercel) — there is no real PHI for such an agreement to cover. This is not a reason to relax the engineering practices in this document or in [25-SECURITY.md](25-SECURITY.md): access control, audit trails, encryption, minimum-necessary access, and patient-rights workflows are all still implemented and tested as if the data were real, because the entire point of the project is to build and demonstrate production-grade healthcare-software practices — only the *data* is fake, never the *discipline*. Retention periods, breach-notification workflows, and similar policy-level (not engineering-level) obligations are therefore out of scope for this build; a real deployment handling actual patient data would need a fresh regulatory review before going live, independent of anything in this specification.
