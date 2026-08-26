# 21 — Reports and Documents

## Report pipeline

```
RAW → EXTRACTED → AI_ANALYZED (optional) → HUMAN_REVIEWED → RELEASED
```

| Stage | What happens | Who can see it |
|---|---|---|
| `RAW` | File uploaded (scan/photo/PDF of a lab or imaging result), no structured values yet | Uploading staff/doctor only |
| `EXTRACTED` | Structured values entered — manually by staff, or via OCR/parsing tooling — into `structuredValues`/`findings` | Ordering doctor, uploading staff |
| `AI_ANALYZED` | Optional: an AI provider generates a plain-language summary/flag of the structured values, stored in `aiSummary` with `aiGenerated = true` | Ordering doctor only (never patient) |
| `HUMAN_REVIEWED` | A `DOCTOR` with `reports.verify` has reviewed the structured values and any AI summary, and either accepts, edits, or discards the AI summary | Ordering doctor, hospital oversight |
| `RELEASED` | Doctor confirms release; `releasedAt` set | Patient (finally), all previously-authorized viewers |

A report is **never** visible to the patient before `RELEASED`, regardless of how far along the pipeline it is — full stop, enforced at the query layer for `SELF`-scoped requests, not just hidden by the UI. Full AI-safety rules for the `AI_ANALYZED` stage: [27-MEDICAL-AI-SAFETY.md](27-MEDICAL-AI-SAFETY.md).

## State machine rules

- Stages only move forward; there is no API to move a report backward (a mistaken release is corrected via the supersession pattern in [20-MEDICAL-RECORDS.md](20-MEDICAL-RECORDS.md), not by un-releasing).
- `POST /reports/:id/verify` is the only endpoint that can set `RELEASED`, and it requires the report to already be at `HUMAN_REVIEWED` or later data present — a doctor cannot release straight from `RAW`/`EXTRACTED` without at least confirming the structured values themselves count as their review (i.e., `HUMAN_REVIEWED` is achieved by the verify action itself when there was no separate AI step; the two can collapse into one action for non-AI-assisted reports).
- `reports.verify` is required for the verify action regardless of who uploaded/ordered the report — a Nurse or lab tech who uploaded a `RAW` file cannot self-release it.

## File handling

- Accepted types: PDF, JPEG, PNG (report attachments); document uploads additionally accept common ID/insurance formats per the same list. Max size 10MB default (hospital-configurable upper bound, not below 2MB, in Post-MVP settings — MVP ships a fixed 10MB limit).
- Server-side MIME verification via file-signature (magic-byte) sniffing, never trusting the client-declared `Content-Type` header — this is the actual defense against `INVALID_FILE_TYPE` bypass attempts, not just an extension check.
- Files are stored via the object storage abstraction ([11-SYSTEM-ARCHITECTURE.md](11-SYSTEM-ARCHITECTURE.md)) under a key scheme namespaced by `hospitalId`/entity type/id, never in a publicly-readable bucket/path.
- Access is always through a short-lived (default 10-minute) signed URL generated per-request after a permission check — `GET /reports/:id/file` and `GET /documents/:id/download` never return a long-lived or public link.
- A pluggable malware-scan hook runs on upload before a file is marked available for structured extraction. Development/Staging use a mock implementation (always reports "clean," so local iteration never depends on a real scanning service); a real scanner (e.g. ClamAV or a cloud scanning API) is wired in behind the same interface before the "production" environment goes live — a user-confirmed requirement tracked as task `T-1508` ([41-TASKS.md](41-TASKS.md)), independent of this project's synthetic-data-only scope.

## Documents vs. Reports

`Document` is the generic attachment primitive; `LabReport`/`ImagingReport` are structured clinical entities that *may* have one or more `Document` rows attached as their source file(s). A patient's own pre-visit upload (e.g. "here's my old MRI") is just a `Document` owned by the patient with no `LabReport` parent — it does not go through the pipeline above because it isn't a hospital-generated result; it becomes clinically relevant only if a doctor references it during a consultation (linked via `linkedEntityType/Id` to that `Consultation`).

## Access logging

Every read of report content or document content — not just uploads/verifies — is audited (`REPORT_VIEW`, `REPORT_DOWNLOAD`, `DOCUMENT_VIEW`, `DOCUMENT_DOWNLOAD`), because clinical file access is exactly the kind of action a hospital's compliance function needs a complete trail of, independent of whether anything was changed. See [24-AUDIT-LOGGING.md](24-AUDIT-LOGGING.md).

## Retention

Reports/documents follow the hospital's data-retention policy (see [26-PRIVACY-AND-DATA-PROTECTION.md](26-PRIVACY-AND-DATA-PROTECTION.md)) — soft-deleted, never hard-deleted, on any retention-driven removal from active use, so an audit trail referencing a since-removed document remains coherent.
