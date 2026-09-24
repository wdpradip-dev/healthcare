"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, FormAlert, TextField } from "@hospital/ui-web";
import { useAuth } from "@/lib/auth-provider";
import { ApiError, resolveFileUrl } from "@/lib/api-client";
import { prescriptionsApi, type MedicationRow } from "@/lib/resources";

interface ItemDraft {
  medication: MedicationRow | null;
  freeText: string;
  dosage: string;
  frequency: string;
  durationDays: string;
  instructions: string;
}

const EMPTY: ItemDraft = { medication: null, freeText: "", dosage: "", frequency: "", durationDays: "", instructions: "" };

/**
 * The Rx tab (docs/09). A prescription is immutable once issued, so there is no
 * edit control — "Correct" issues a new one that supersedes the old.
 */
export function PrescriptionsPanel({ consultationId, patientId, canWrite }: { consultationId: string; patientId: string; canWrite: boolean }) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [supersedes, setSupersedes] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchIndex, setSearchIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: prescriptions } = useQuery({
    queryKey: ["prescriptions", patientId, consultationId],
    queryFn: () => prescriptionsApi.list(accessToken!, { patientId }),
    enabled: Boolean(accessToken),
  });
  const mine = (prescriptions ?? []).filter((p) => p.consultationId === consultationId);

  const { data: matches } = useQuery({
    queryKey: ["medications", search],
    queryFn: () => prescriptionsApi.medications(accessToken!, search),
    enabled: Boolean(accessToken) && canWrite && search.trim().length >= 2,
  });

  const issue = useMutation({
    mutationFn: () =>
      prescriptionsApi.create(accessToken!, {
        consultationId,
        ...(supersedes ? { supersedesId: supersedes } : {}),
        items: items.map((i) => ({
          ...(i.medication ? { medicationId: i.medication.id } : { freeTextName: i.freeText.trim() }),
          dosage: i.dosage.trim(),
          frequency: i.frequency.trim(),
          ...(i.durationDays.trim() ? { durationDays: Number(i.durationDays) } : {}),
          ...(i.instructions.trim() ? { instructions: i.instructions.trim() } : {}),
        })),
      }),
    onSuccess: () => {
      setItems([]);
      setSupersedes(null);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["prescriptions"] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Couldn't issue the prescription."),
  });

  const pdf = useMutation({
    mutationFn: (id: string) => prescriptionsApi.pdfUrl(accessToken!, id),
    onSuccess: ({ url }) => window.open(resolveFileUrl(url), "_blank", "noopener,noreferrer"),
    onError: (e) => setError(e instanceof ApiError ? e.message : "Couldn't open the PDF."),
  });

  const patch = (index: number, change: Partial<ItemDraft>) => setItems(items.map((it, i) => (i === index ? { ...it, ...change } : it)));
  const ready = items.length > 0 && items.every((i) => (i.medication || i.freeText.trim()) && i.dosage.trim() && i.frequency.trim());

  return (
    <section className="flex flex-col gap-3">
      {error ? <FormAlert variant="error">{error}</FormAlert> : null}

      {mine.map((p) => (
        <div key={p.id} className="flex flex-col gap-1 rounded border border-outline/20 p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-on-surface">
              Prescription · {p.status === "ACTIVE" ? "Active" : p.status === "SUPERSEDED" ? "Superseded" : "Expired"}
            </span>
            <span className="flex gap-3">
              <button type="button" className="text-primary hover:underline" onClick={() => pdf.mutate(p.id)}>
                PDF
              </button>
              {canWrite && p.status === "ACTIVE" ? (
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => {
                    setSupersedes(p.id);
                    setItems(
                      p.items.map((i) => ({
                        medication: i.medication,
                        freeText: i.freeTextName ?? "",
                        dosage: i.dosage,
                        frequency: i.frequency,
                        durationDays: i.durationDays ? String(i.durationDays) : "",
                        instructions: i.instructions ?? "",
                      })),
                    );
                  }}
                >
                  Correct
                </button>
              ) : null}
            </span>
          </div>
          <ul className="text-sm text-on-surface-variant">
            {p.items.map((i) => (
              <li key={i.id}>
                {i.medication ? [i.medication.name, i.medication.strength].filter(Boolean).join(" ") : i.freeTextName} — {i.dosage}, {i.frequency}
                {i.durationDays ? `, ${i.durationDays} days` : ""}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {mine.length === 0 && !canWrite ? <p className="text-on-surface-variant">No prescriptions.</p> : null}

      {canWrite ? (
        <>
          {supersedes ? <p className="text-sm text-tertiary">Issuing a correction — the earlier prescription will be marked superseded.</p> : null}
          {items.map((item, index) => (
            <div key={index} className="flex flex-col gap-2 rounded border border-outline/20 p-3">
              {item.medication ? (
                <p className="text-sm font-medium text-on-surface">
                  {[item.medication.name, item.medication.strength].filter(Boolean).join(" ")}
                  <button type="button" className="ml-2 text-primary hover:underline" onClick={() => patch(index, { medication: null })}>
                    change
                  </button>
                </p>
              ) : (
                <>
                  <TextField
                    label="Medication"
                    value={searchIndex === index ? search : item.freeText}
                    onFocus={() => {
                      setSearchIndex(index);
                      setSearch(item.freeText);
                    }}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      patch(index, { freeText: e.target.value });
                    }}
                  />
                  {searchIndex === index && matches && matches.length > 0 ? (
                    <ul className="rounded border border-outline/20">
                      {matches.map((m) => (
                        <li key={m.id}>
                          <button
                            type="button"
                            className="w-full px-3 py-1 text-left text-sm hover:bg-surface-container"
                            onClick={() => {
                              patch(index, { medication: m, freeText: "" });
                              setSearchIndex(null);
                              setSearch("");
                            }}
                          >
                            {[m.name, m.strength, m.form].filter(Boolean).join(" · ")}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              )}
              <div className="grid grid-cols-3 gap-2">
                <TextField label="Dosage" value={item.dosage} onChange={(e) => patch(index, { dosage: e.target.value })} />
                <TextField label="Frequency" value={item.frequency} onChange={(e) => patch(index, { frequency: e.target.value })} />
                <TextField label="Days" type="number" value={item.durationDays} onChange={(e) => patch(index, { durationDays: e.target.value })} />
              </div>
              <TextField label="Instructions (optional)" value={item.instructions} onChange={(e) => patch(index, { instructions: e.target.value })} />
              <button type="button" className="self-start text-sm text-error hover:underline" onClick={() => setItems(items.filter((_, i) => i !== index))}>
                Remove
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <Button className="w-auto" variant="secondary" onClick={() => setItems([...items, EMPTY])}>
              + Add Medication
            </Button>
            {items.length > 0 ? (
              <Button className="w-auto" disabled={!ready} loading={issue.isPending} onClick={() => issue.mutate()}>
                Issue Prescription
              </Button>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
