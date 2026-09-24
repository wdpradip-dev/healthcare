"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { VitalsInput } from "@hospital/validation";
import { Button, FormAlert, Modal, TextField } from "@hospital/ui-web";
import { useAuth } from "@/lib/auth-provider";
import { hasPermission } from "@/lib/permissions";
import { ApiError } from "@/lib/api-client";
import { consultationsApi, type ConsultationDetail } from "@/lib/resources";
import { PrescriptionsPanel } from "@/components/consultations/prescriptions-panel";
import { ReportsPanel } from "@/components/consultations/reports-panel";

type Tab = "vitals" | "notes" | "diagnosis" | "rx" | "reports";

interface NoteDraft {
  id?: string;
  content: string;
  isInternal: boolean;
}

interface DiagnosisDraft {
  icd10Code: string;
  description: string;
}

const VITAL_FIELDS = [
  { key: "bloodPressureSystolic", label: "BP systolic (mmHg)" },
  { key: "bloodPressureDiastolic", label: "BP diastolic (mmHg)" },
  { key: "heartRate", label: "Heart rate (bpm)" },
  { key: "temperatureCelsius", label: "Temp (°C)" },
  { key: "weightKg", label: "Weight (kg)" },
  { key: "heightCm", label: "Height (cm)" },
  { key: "spo2", label: "SpO₂ (%)" },
] as const;

type VitalKey = (typeof VITAL_FIELDS)[number]["key"];
type VitalsDraft = Record<VitalKey, string>;

const EMPTY_VITALS: VitalsDraft = {
  bloodPressureSystolic: "",
  bloodPressureDiastolic: "",
  heartRate: "",
  temperatureCelsius: "",
  weightKg: "",
  heightCm: "",
  spo2: "",
};

const AUTOSAVE_MS = 30_000;

function toVitalsInput(draft: VitalsDraft): VitalsInput | null {
  const entries = VITAL_FIELDS.flatMap(({ key }) => (draft[key].trim() === "" ? [] : [[key, Number(draft[key])] as const]));
  return entries.length > 0 ? (Object.fromEntries(entries) as VitalsInput) : null;
}

/** The caller's own most recent vitals row, as form strings. */
function ownVitalsDraft(consultation: ConsultationDetail, userId: string): VitalsDraft {
  const mine = [...consultation.vitals].reverse().find((v) => v.recordedBy === userId);
  if (!mine) {
    return EMPTY_VITALS;
  }
  return Object.fromEntries(VITAL_FIELDS.map(({ key }) => [key, mine[key] == null ? "" : String(mine[key])])) as VitalsDraft;
}

/**
 * docs/09-ADMIN-DESIGN-MOCKUPS.md "Consultation Workspace". The mockup's
 * "ICD-10 search" needs a code catalog that isn't in the data model — the
 * Diagnosis tab takes a free-text code + description instead. The Rx and
 * Reports tabs manage their own data (they save immediately, not with the
 * autosaved draft) and are shown to anyone who can read those resources. Autosaves every
 * 30s while there are unsaved edits (docs/09); a Doctor edits everything, a
 * Nurse only the Vitals tab, everyone else is read-only.
 */
export default function ConsultationWorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { accessToken, user } = useAuth();
  const queryClient = useQueryClient();
  const role = user?.roles[0] ?? "";

  const [tab, setTab] = useState<Tab>("vitals");
  const [notes, setNotes] = useState<NoteDraft[]>([]);
  const [diagnoses, setDiagnoses] = useState<DiagnosisDraft[]>([]);
  const [vitals, setVitals] = useState<VitalsDraft>(EMPTY_VITALS);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const hydrated = useRef(false);

  const { data: consultation, isLoading, isError } = useQuery({
    queryKey: ["consultation", id],
    queryFn: () => consultationsApi.getById(accessToken!, id),
    enabled: Boolean(accessToken) && Boolean(id),
  });

  const hydrate = useCallback(
    (c: ConsultationDetail) => {
      setNotes(c.clinicalNotes.filter((n) => n.authorId === user?.id).map((n) => ({ id: n.id, content: n.content, isInternal: n.isInternal })));
      setDiagnoses(c.diagnoses.map((d) => ({ icd10Code: d.icd10Code ?? "", description: d.description })));
      setVitals(ownVitalsDraft(c, user?.id ?? ""));
      setDirty(false);
    },
    [user?.id],
  );

  useEffect(() => {
    if (consultation && !hydrated.current) {
      hydrated.current = true;
      hydrate(consultation);
    }
  }, [consultation, hydrate]);

  const open = consultation?.status === "IN_PROGRESS";
  const canWriteClinical = open && role === "DOCTOR" && hasPermission(user, "consultations.write");
  const canWriteVitals = open && (role === "DOCTOR" || role === "NURSE") && hasPermission(user, "medical_records.write");
  const canSeeRx = hasPermission(user, "prescriptions.read");
  const canSeeReports = hasPermission(user, "reports.read");
  const canOrderTests = role === "DOCTOR" && open && hasPermission(user, "lab_orders.write");
  const canIssueRx = role === "DOCTOR" && hasPermission(user, "prescriptions.write");
  const vitalsInput = toVitalsInput(vitals);
  const filledNotes = notes.filter((n) => n.content.trim() !== "");
  const filledDiagnoses = diagnoses.filter((d) => d.description.trim() !== "");

  const saveMutation = useMutation({
    mutationFn: () => {
      if (canWriteClinical) {
        return consultationsApi.update(accessToken!, id, {
          notes: filledNotes.map((n) => ({ id: n.id, content: n.content.trim(), isInternal: n.isInternal })),
          diagnoses: filledDiagnoses.map((d) => ({ icd10Code: d.icd10Code.trim() || undefined, description: d.description.trim() })),
          ...(vitalsInput ? { vitals: vitalsInput } : {}),
        });
      }
      return consultationsApi.updateVitals(accessToken!, id, vitalsInput!);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["consultation", id], updated);
      hydrate(updated);
      setError(null);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Couldn't save. Please try again."),
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (dirty && canWriteClinical) {
        await saveMutation.mutateAsync();
      }
      return consultationsApi.complete(accessToken!, id);
    },
    onSuccess: () => {
      setConfirmOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["appointments"] });
      router.push("/appointments");
    },
    onError: (e) => {
      setConfirmOpen(false);
      setError(e instanceof ApiError ? e.message : "Couldn't complete the consultation.");
    },
  });

  const saveable = dirty && !saveMutation.isPending && (canWriteClinical || (canWriteVitals && vitalsInput !== null));
  const { mutate: save } = saveMutation;

  useEffect(() => {
    if (!saveable) {
      return;
    }
    const timer = setInterval(() => save(), AUTOSAVE_MS);
    return () => clearInterval(timer);
  }, [saveable, save]);

  const edit = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setDirty(true);
  };

  if (isLoading) {
    return <p className="text-on-surface-variant">Loading…</p>;
  }
  if (isError || !consultation) {
    return <FormAlert variant="error">Couldn&apos;t load this consultation.</FormAlert>;
  }

  const busy = saveMutation.isPending || completeMutation.isPending;
  const others = consultation.clinicalNotes.filter((n) => n.authorId !== user?.id);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-on-surface">
          {consultation.patient.user.name} · Consultation
          <span className="ml-2 text-sm font-normal text-on-surface-variant">
            {consultation.status === "COMPLETED" ? "Completed" : "In progress"}
          </span>
        </h1>
        <div className="flex gap-2">
          {saveable || saveMutation.isPending ? (
            <Button className="w-auto" variant="secondary" onClick={() => save()} loading={saveMutation.isPending}>
              Save
            </Button>
          ) : null}
          {canWriteClinical ? (
            <Button className="w-auto" disabled={busy || (filledNotes.length === 0 && filledDiagnoses.length === 0)} onClick={() => setConfirmOpen(true)}>
              Complete
            </Button>
          ) : null}
        </div>
      </div>

      {error ? <FormAlert variant="error">{error}</FormAlert> : null}
      {!open ? <p className="text-sm text-on-surface-variant">This consultation is closed — read-only.</p> : null}

      <div role="tablist" className="flex gap-4 border-b border-outline/30">
        {(["vitals", "notes", "diagnosis", ...(canSeeRx ? (["rx"] as const) : []), ...(canSeeReports ? (["reports"] as const) : [])] as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`py-2 text-sm font-medium capitalize ${tab === t ? "border-b-2 border-primary text-primary" : "text-on-surface-variant"}`}
          >
            {t === "rx" ? "Rx" : t}
          </button>
        ))}
      </div>

      {tab === "vitals" ? (
        <section className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {VITAL_FIELDS.map(({ key, label }) => (
              <TextField
                key={key}
                label={label}
                type="number"
                step="any"
                value={vitals[key]}
                disabled={!canWriteVitals || busy}
                onChange={(e) => edit(setVitals)({ ...vitals, [key]: e.target.value })}
              />
            ))}
          </div>
          {consultation.vitals.filter((v) => v.recordedBy !== user?.id).length > 0 ? (
            <p className="text-sm text-on-surface-variant">
              Also recorded by others:{" "}
              {consultation.vitals
                .filter((v) => v.recordedBy !== user?.id)
                .map((v) => `BP ${v.bloodPressureSystolic ?? "—"}/${v.bloodPressureDiastolic ?? "—"} · HR ${v.heartRate ?? "—"}`)
                .join("; ")}
            </p>
          ) : null}
        </section>
      ) : null}

      {tab === "notes" ? (
        <section className="flex flex-col gap-3">
          {notes.map((note, index) => (
            <div key={note.id ?? `new-${index}`} className="flex flex-col gap-2 rounded border border-outline/20 p-3">
              <label className="text-sm font-medium text-on-surface" htmlFor={`note-${index}`}>
                Clinical note
              </label>
              <textarea
                id={`note-${index}`}
                className="min-h-24 rounded-sm border border-outline bg-surface p-2 text-sm text-on-surface"
                value={note.content}
                disabled={!canWriteClinical || busy}
                onChange={(e) => edit(setNotes)(notes.map((n, i) => (i === index ? { ...n, content: e.target.value } : n)))}
              />
              <label className="flex items-center gap-2 text-sm text-on-surface-variant">
                <input
                  type="checkbox"
                  checked={note.isInternal}
                  disabled={!canWriteClinical || busy}
                  onChange={(e) => edit(setNotes)(notes.map((n, i) => (i === index ? { ...n, isInternal: e.target.checked } : n)))}
                />
                Internal only (not visible to patient)
              </label>
            </div>
          ))}
          {canWriteClinical ? (
            <Button className="w-auto" variant="secondary" onClick={() => edit(setNotes)([...notes, { content: "", isInternal: false }])}>
              + Add Note
            </Button>
          ) : null}
          {others.map((n) => (
            <p key={n.id} className="rounded border border-outline/10 p-3 text-sm text-on-surface-variant">
              {n.isInternal ? <span className="mr-2 font-medium text-tertiary">Internal</span> : null}
              {n.content}
            </p>
          ))}
          {notes.length === 0 && others.length === 0 ? <p className="text-on-surface-variant">No notes yet.</p> : null}
        </section>
      ) : null}

      {tab === "diagnosis" ? (
        <section className="flex flex-col gap-3">
          {diagnoses.map((d, index) => (
            <div key={index} className="flex flex-wrap items-end gap-2">
              <TextField
                label="ICD-10 code (optional)"
                className="w-40"
                value={d.icd10Code}
                disabled={!canWriteClinical || busy}
                onChange={(e) => edit(setDiagnoses)(diagnoses.map((x, i) => (i === index ? { ...x, icd10Code: e.target.value } : x)))}
              />
              <TextField
                label="Diagnosis"
                value={d.description}
                disabled={!canWriteClinical || busy}
                onChange={(e) => edit(setDiagnoses)(diagnoses.map((x, i) => (i === index ? { ...x, description: e.target.value } : x)))}
              />
              {canWriteClinical ? (
                <button
                  type="button"
                  className="h-11 text-sm font-medium text-error hover:underline"
                  onClick={() => edit(setDiagnoses)(diagnoses.filter((_, i) => i !== index))}
                >
                  Remove
                </button>
              ) : null}
            </div>
          ))}
          {canWriteClinical ? (
            <Button className="w-auto" variant="secondary" onClick={() => edit(setDiagnoses)([...diagnoses, { icd10Code: "", description: "" }])}>
              + Add Diagnosis
            </Button>
          ) : null}
          {diagnoses.length === 0 && !canWriteClinical ? <p className="text-on-surface-variant">No diagnosis recorded.</p> : null}
        </section>
      ) : null}

      {tab === "rx" ? (
        <PrescriptionsPanel consultationId={consultation.id} patientId={consultation.patient.id} canWrite={canIssueRx && open} />
      ) : null}

      {tab === "reports" ? <ReportsPanel consultationId={consultation.id} patientId={consultation.patient.id} canOrder={canOrderTests} /> : null}

      {confirmOpen ? (
        <Modal title="Complete consultation?" onClose={() => setConfirmOpen(false)}>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-on-surface">
              Completing this consultation closes it to further edits and makes the record (excluding internal-only notes) visible to the patient.
            </p>
            <Button loading={completeMutation.isPending} onClick={() => completeMutation.mutate()}>
              Confirm &amp; Complete
            </Button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
