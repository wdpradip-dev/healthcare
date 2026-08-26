# 27 — Medical AI Safety

## Governing rule

**AI output never automatically becomes a medical diagnosis, treatment recommendation, or part of the permanent verified record.** Every AI-generated artifact is advisory, clearly labeled, scoped to a single narrow task (summarizing/flagging structured report values), and requires explicit human clinician review before it can influence anything patient-visible. This rule is absolute and applies identically regardless of which AI provider or model is used.

## Where AI is allowed (and where it is not)

| Use | Allowed in MVP? | Notes |
|---|---|---|
| Summarizing/flagging structured lab or imaging values already entered by a human (`AI_ANALYZED` pipeline stage) | ✓ | Advisory only, see pipeline below |
| Extracting structured values from a raw scanned/uploaded report (OCR-style assist) | ✓ (as a drafting aid) | Extracted values still require the doctor to review before `HUMAN_REVIEWED` |
| Autonomous diagnosis suggestion presented as a diagnosis | ✗ Never | Explicit non-goal, see [01-PRODUCT-REQUIREMENTS.md](01-PRODUCT-REQUIREMENTS.md) |
| Autonomous treatment/prescription recommendation | ✗ Never | No AI-generated prescription content exists anywhere in the schema or API |
| AI content auto-released to a patient without clinician review | ✗ Never | Structurally impossible — see pipeline gate below |
| AI used to auto-triage/prioritize appointment urgency | ✗ Not in MVP | Plausible future feature, would need its own safety review before inclusion |

## Pipeline gate (mechanism, not just policy)

From [21-REPORTS-AND-DOCUMENTS.md](21-REPORTS-AND-DOCUMENTS.md): `RAW → EXTRACTED → AI_ANALYZED → HUMAN_REVIEWED → RELEASED`. The gate is enforced structurally:

- `LabReport.aiGenerated` and `LabReport.aiSummary` are **separate fields** from the clinician-entered `structuredValues` — AI output can never overwrite or masquerade as clinician-entered data at the database level, there is no code path that copies `aiSummary` into a field a doctor would mistake for their own entry.
- The `POST /reports/:id/verify` endpoint (the only path to `RELEASED`) requires `reports.verify`, held only by `DOCTOR` (and break-glass Super Admin) — never granted to the AI system's own service account, which by construction has no permission to call this endpoint.
- The patient-facing report API (`SELF` scope) returns `aiSummary` **only when** `pipelineStatus = RELEASED` **and** always alongside `aiGenerated: true` and the verifying doctor's name — the client cannot render an AI summary without also rendering its provenance label, because they're returned as one inseparable payload shape, not assembled client-side from separately-fetched flags that a UI bug could decouple.

## Labeling requirement

Every surface that renders AI-generated content — mobile Report Details ([08-MOBILE-DESIGN-MOCKUPS.md](08-MOBILE-DESIGN-MOCKUPS.md)), the admin Consultation Workspace/Report Details ([09-ADMIN-DESIGN-MOCKUPS.md](09-ADMIN-DESIGN-MOCKUPS.md)) — shows a persistent, unambiguous label ("🤖 AI-Assisted Summary — reviewed by Dr. X") that is part of the component itself, not a dismissible banner. The label is never omitted for space, brevity, or "the user already knows" reasons.

## Doctor review requirements

When `reports.verify` is exercised on a report carrying an AI summary, the reviewing doctor must take one of three explicit actions on the AI content specifically (not just a blanket "approve report" click that could rubber-stamp unread AI text):
1. **Accept as shown** — AI summary is retained verbatim, doctor attribution recorded.
2. **Edit** — doctor modifies the AI summary text before release; the edited version is what patients see, still labeled AI-assisted (since it originated there) plus "edited by Dr. X."
3. **Discard** — AI summary is removed entirely from the released report; only the structured values and the doctor's own notes (if any, entered elsewhere in the consultation) are patient-visible.

This three-way choice is a UI/API requirement (`POST /reports/:id/verify` body includes an `aiSummaryDecision` field), not left to convention, so it's testable.

## AI provider: Groq

**Groq** is the confirmed AI report-assist provider ([ADR-012](43-ARCHITECTURE-DECISIONS.md)), accessed exclusively through the `AiReportAssistProvider` interface in `packages/shared` — no domain code ever imports the Groq SDK directly, so swapping providers later touches one implementation file, not the report pipeline. This choice is compatible with the confirmed learning/demo, synthetic-data-only scope ([26-PRIVACY-AND-DATA-PROTECTION.md](26-PRIVACY-AND-DATA-PROTECTION.md)): since no real patient data is ever processed, Groq's standard API data-handling terms are sufficient and no additional data-processing agreement is required. A production deployment handling real patient data would need to review Groq's (or any provider's) data-handling terms against that deployment's actual regulatory obligations before use — out of scope here by the same confirmed decision.

## Data sent to the AI provider

Only the structured report values (test names, numeric results, reference ranges) relevant to generating a summary are sent to Groq — not the patient's full medical history, not their name/DOB/contact info where avoidable (a de-identified or minimally-identified payload, straightforward to guarantee here precisely because the underlying data is synthetic fixture data to begin with). No AI provider is granted standing database access; every call is a scoped request/response through the provider-abstraction layer described in [11-SYSTEM-ARCHITECTURE.md](11-SYSTEM-ARCHITECTURE.md).

## Failure behavior

If the AI provider is unavailable, times out, or returns a low-confidence/unusable result, the report simply proceeds through the pipeline without an `AI_ANALYZED` stage — a doctor reviews and releases based on the structured values alone. AI assistance is additive and optional at every step; its absence or failure never blocks a report from being released, and never degrades to a lower-quality automated fallback (e.g. no "best guess" diagnosis substituted when the primary AI call fails).

## Audit trail for AI actions

`REPORT_AI_ANALYZE` (when the AI call is made, provider + model version recorded) and the doctor's `aiSummaryDecision` (accept/edit/discard) captured within the `REPORT_VERIFY` audit entry's `afterState` — so any released report's AI provenance and the specific human decision about it is reconstructable from the audit log alone, independent of the current database state.
