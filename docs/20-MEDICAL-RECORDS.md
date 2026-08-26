# 20 — Medical Records

## Structure

A patient's medical record is not one table but a chronological composite view over several entities, all scoped by `patientId` (+ `hospitalId` per row): `Consultation` (the anchor event) with its `ClinicalNote`, `Diagnosis`, `Vital` children, plus the longitudinal `MedicalCondition` and `Allergy` lists, plus `Prescription` and `LabReport`/`ImagingReport` records linked back to the originating `Consultation`. See [13-DATABASE-DESIGN.md](13-DATABASE-DESIGN.md) for exact schema and [14-DATABASE-ERD.md](14-DATABASE-ERD.md) for relationships.

## Chronology

`GET /medical-records` returns a unified, time-ordered feed by merging `Consultation` (as the primary timeline event), `LabReport`/`ImagingReport` releases, and `Prescription` issuances into one sorted list, each entry typed (`type: consultation|report|prescription`) so the client can render appropriate cards without separate round-trips. Sort key is the clinically-relevant timestamp (`consultation.completedAt`, `report.releasedAt`, `prescription.issuedAt`) — not `createdAt`, since a report's row can be created (RAW) well before it's clinically meaningful (RELEASED).

## Append-oriented, not destructive

- `Consultation`, `ClinicalNote`, `Diagnosis`, `Vital` become immutable once the consultation is `COMPLETED`. Corrections after completion require a new addendum entry (a new `ClinicalNote` with a reference back to what it amends via `content` text convention, e.g. "Addendum to note dated..."), never an in-place edit of finalized clinical content. Before completion, autosave updates are allowed (draft state).
- `Prescription` is immutable from creation; corrections supersede via `supersedesId` (see [13-DATABASE-DESIGN.md](13-DATABASE-DESIGN.md)).
- `LabReport`/`ImagingReport` become immutable once `RELEASED`; a materially wrong released report is corrected by creating a new report version linked to the same `LabOrder`, with the superseded one remaining visible (marked superseded) rather than edited or hidden — this preserves the record a clinical decision may have already been made from.

This append-only discipline is what makes the audit trail in [24-AUDIT-LOGGING.md](24-AUDIT-LOGGING.md) meaningful — there is no "what did this used to say before it was edited" ambiguity for finalized clinical data, because it's never edited in place.

## Internal vs. patient-visible content

`ClinicalNote.isInternal = true` notes (clinician-to-clinician observations not intended for the patient) are filtered out of every patient-scoped API response at the query layer (not just the UI) — the patient-facing `medical-records` service method never selects internal notes for a `SELF`-scoped requester. Diagnoses and prescriptions have no internal/external split (they are always patient-visible once the consultation completes) since hiding a diagnosis from the patient it belongs to is a product non-goal.

## Access control

- Patient: `SELF` scope — own records only, across every hospital they've visited.
- Doctor: `ASSIGNED` scope — patients they have an appointment/consultation relationship with, within their own hospital.
- Nurse: `BRANCH` scope, read-only plus vitals write — supports intake without full clinical authorship.
- Admin: `HOSPITAL` scope, read-only oversight (Admin is not assumed clinically qualified to author records even if they can see them for operational/compliance purposes).
- Receptionist: no medical-record access at all.

Full permission definitions: [02-PERSONAS-AND-ROLES.md](02-PERSONAS-AND-ROLES.md), enforcement mechanics: [17-AUTHORIZATION-RBAC.md](17-AUTHORIZATION-RBAC.md).

## Cross-hospital view

A patient who has visited Hospital A and Hospital B sees both in their Medical Dashboard, clearly labeled by hospital, filterable to one. Doctors never get this cross-hospital view — a Doctor at Hospital A cannot see a consultation that happened at Hospital B even for the same patient, absent the patient explicitly sharing/exporting a record to bring to a new provider (a "bring your own history" document upload, which is just a `Document` the patient attaches, not a system-level record share — true record portability/consent-based sharing across hospitals is Post-MVP).

## Vitals and allergies visibility

Allergies and active `MedicalCondition`s are always surfaced prominently (not buried in history) on the Doctor's Patient Details / Consultation Workspace overview tab specifically because they are safety-critical at the point of care — this is a UX requirement documented here because it originates from a clinical-safety concern, not a general design preference.
