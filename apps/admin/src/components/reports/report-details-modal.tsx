"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { StructuredValues } from "@hospital/validation";
import { Button, FormAlert, Modal, TextField } from "@hospital/ui-web";
import { useAuth } from "@/lib/auth-provider";
import { hasPermission } from "@/lib/permissions";
import { ApiError, resolveFileUrl } from "@/lib/api-client";
import { reportsApi, type ReportPipelineStatus, type ReportRow } from "@/lib/resources";
import { AiSummaryBlock } from "./ai-summary-block";

export const PIPELINE_LABELS: Record<ReportPipelineStatus, string> = {
  RAW: "Uploaded — values pending",
  EXTRACTED: "Values entered",
  AI_ANALYZED: "AI summary awaiting review",
  HUMAN_REVIEWED: "Reviewed",
  RELEASED: "Released to patient",
};

type Decision = "ACCEPT" | "EDIT" | "DISCARD";

interface ValueDraft {
  name: string;
  value: string;
  unit: string;
  referenceRange: string;
}

function toValues(rows: ValueDraft[]): StructuredValues | null {
  const filled = rows.filter((r) => r.name.trim() !== "" && r.value.trim() !== "");
  if (filled.length === 0) return null;
  return Object.fromEntries(
    filled.map((r) => [
      r.name.trim(),
      {
        value: r.value.trim() !== "" && !Number.isNaN(Number(r.value)) ? Number(r.value) : r.value.trim(),
        ...(r.unit.trim() ? { unit: r.unit.trim() } : {}),
        ...(r.referenceRange.trim() ? { referenceRange: r.referenceRange.trim() } : {}),
      },
    ]),
  );
}

/** docs/09 "Report Details" — values, the AI block (always labeled), and the review actions. */
export function ReportDetailsModal({ reportId, onClose }: { reportId: string; onClose: () => void }) {
  const { accessToken, user } = useAuth();
  const queryClient = useQueryClient();
  const isDoctor = user?.roles[0] === "DOCTOR";
  const canEnter = isDoctor && hasPermission(user, "reports.upload");
  const canVerify = isDoctor && hasPermission(user, "reports.verify");

  const [rows, setRows] = useState<ValueDraft[]>([{ name: "", value: "", unit: "", referenceRange: "" }]);
  const [findings, setFindings] = useState("");
  const [decision, setDecision] = useState<Decision | "">("");
  const [edited, setEdited] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { data: report, isLoading } = useQuery({
    queryKey: ["report", reportId],
    queryFn: () => reportsApi.getById(accessToken!, reportId),
    enabled: Boolean(accessToken),
  });

  const refresh = (updated: ReportRow) => {
    queryClient.setQueryData(["report", reportId], updated);
    void queryClient.invalidateQueries({ queryKey: ["reports"] });
    setError(null);
  };
  const fail = (e: unknown) => setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");

  const saveValues = useMutation({
    mutationFn: () => {
      if (report?.type === "lab") {
        return reportsApi.update(accessToken!, reportId, { structuredValues: toValues(rows)! });
      }
      return reportsApi.update(accessToken!, reportId, { findings: findings.trim() });
    },
    onSuccess: refresh,
    onError: fail,
  });

  const analyze = useMutation({
    mutationFn: () => reportsApi.analyze(accessToken!, reportId),
    onSuccess: (result) => {
      refresh(result.report);
      setNotice(result.aiAvailable ? null : "AI assistance is unavailable right now — you can still review and release the values.");
    },
    onError: fail,
  });

  const verify = useMutation({
    mutationFn: () =>
      reportsApi.verify(accessToken!, reportId, {
        ...(report?.aiSummary && decision ? { aiSummaryDecision: decision } : {}),
        ...(decision === "EDIT" ? { editedAiSummary: edited.trim() } : {}),
      }),
    onSuccess: refresh,
    onError: fail,
  });

  const openFile = useMutation({
    mutationFn: () => reportsApi.fileUrl(accessToken!, reportId),
    onSuccess: ({ url }) => window.open(resolveFileUrl(url), "_blank", "noopener,noreferrer"),
    onError: fail,
  });

  const entering = report?.pipelineStatus === "RAW" || report?.pipelineStatus === "EXTRACTED";
  const values = report?.structuredValues ? Object.entries(report.structuredValues) : [];
  const hasAi = report?.aiSummary != null && report.pipelineStatus === "AI_ANALYZED";
  const reviewable = report?.pipelineStatus === "EXTRACTED" || report?.pipelineStatus === "AI_ANALYZED";
  const verifyReady = !hasAi || (decision !== "" && (decision !== "EDIT" || edited.trim() !== ""));
  const canSaveValues = report?.type === "lab" ? toValues(rows) !== null : findings.trim() !== "";

  return (
    <Modal title={report ? `${report.title} · ${report.patientName}` : "Report"} onClose={onClose}>
      {isLoading || !report ? (
        <p className="text-on-surface-variant">Loading…</p>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-on-surface-variant">
            {report.type === "lab" ? "Lab report" : "Imaging report"} · {PIPELINE_LABELS[report.pipelineStatus]}
          </p>
          {error ? <FormAlert variant="error">{error}</FormAlert> : null}
          {notice ? <p className="text-sm text-on-surface-variant">{notice}</p> : null}

          {values.length > 0 ? (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-on-surface-variant">
                  <th className="py-1">Test</th>
                  <th>Result</th>
                  <th>Reference</th>
                </tr>
              </thead>
              <tbody>
                {values.map(([name, v]) => (
                  <tr key={name} className="border-t border-outline/10">
                    <td className="py-1">{name}</td>
                    <td>
                      {v.value} {v.unit ?? ""}
                      {v.flag && v.flag !== "NORMAL" ? <span className="ml-1 font-medium text-error">{v.flag}</span> : null}
                    </td>
                    <td>{v.referenceRange ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {report.findings ? <p className="whitespace-pre-wrap text-sm text-on-surface">{report.findings}</p> : null}

          {report.aiSummary ? <AiSummaryBlock summary={report.aiSummary} /> : null}

          {canEnter && entering ? (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-on-surface">{report.type === "lab" ? "Enter values" : "Enter findings"}</h2>
              {report.type === "lab" ? (
                rows.map((row, i) => (
                  <div key={i} className="grid grid-cols-4 gap-2">
                    <TextField label="Test" value={row.name} onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))} />
                    <TextField label="Value" value={row.value} onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))} />
                    <TextField label="Unit" value={row.unit} onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, unit: e.target.value } : r)))} />
                    <TextField label="Reference range" value={row.referenceRange} onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, referenceRange: e.target.value } : r)))} />
                  </div>
                ))
              ) : (
                <textarea
                  aria-label="Findings"
                  className="min-h-24 rounded-sm border border-outline bg-surface p-2 text-sm text-on-surface"
                  value={findings}
                  onChange={(e) => setFindings(e.target.value)}
                />
              )}
              <div className="flex gap-2">
                {report.type === "lab" ? (
                  <Button className="w-auto" variant="secondary" onClick={() => setRows([...rows, { name: "", value: "", unit: "", referenceRange: "" }])}>
                    + Add row
                  </Button>
                ) : null}
                <Button className="w-auto" disabled={!canSaveValues} loading={saveValues.isPending} onClick={() => saveValues.mutate()}>
                  Save values
                </Button>
              </div>
            </section>
          ) : null}

          {canEnter && report.pipelineStatus === "EXTRACTED" ? (
            <Button className="w-auto" variant="secondary" loading={analyze.isPending} onClick={() => analyze.mutate()}>
              Generate AI summary (optional)
            </Button>
          ) : null}

          {canVerify && reviewable ? (
            <section className="flex flex-col gap-2 border-t border-outline/20 pt-3">
              <h2 className="text-sm font-semibold text-on-surface">Review &amp; release to patient</h2>
              {hasAi ? (
                <fieldset className="flex flex-col gap-1 text-sm text-on-surface">
                  <legend className="mb-1 text-on-surface-variant">What should happen to the AI summary?</legend>
                  {(["ACCEPT", "EDIT", "DISCARD"] as const).map((d) => (
                    <label key={d} className="flex items-center gap-2">
                      <input type="radio" name="ai-decision" checked={decision === d} onChange={() => setDecision(d)} />
                      {d === "ACCEPT" ? "Accept as shown" : d === "EDIT" ? "Edit before release" : "Discard it"}
                    </label>
                  ))}
                  {decision === "EDIT" ? (
                    <textarea
                      aria-label="Edited AI summary"
                      className="min-h-20 rounded-sm border border-outline bg-surface p-2 text-sm text-on-surface"
                      value={edited}
                      onChange={(e) => setEdited(e.target.value)}
                    />
                  ) : null}
                </fieldset>
              ) : null}
              <Button className="w-auto" disabled={!verifyReady} loading={verify.isPending} onClick={() => verify.mutate()}>
                Verify &amp; Release
              </Button>
            </section>
          ) : null}

          <Button className="w-auto" variant="secondary" loading={openFile.isPending} onClick={() => openFile.mutate()}>
            View source file
          </Button>
        </div>
      )}
    </Modal>
  );
}
