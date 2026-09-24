"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, FormAlert, SelectField, TextField } from "@hospital/ui-web";
import { useAuth } from "@/lib/auth-provider";
import { ApiError } from "@/lib/api-client";
import { labOrdersApi, reportsApi } from "@/lib/resources";
import { PIPELINE_LABELS, ReportDetailsModal } from "@/components/reports/report-details-modal";

/** The Reports tab (docs/09): order a test, attach the result file, and open a report for review. */
export function ReportsPanel({ consultationId, patientId, canOrder }: { consultationId: string; patientId: string; canOrder: boolean }) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const [testType, setTestType] = useState("");
  const [priority, setPriority] = useState<"ROUTINE" | "URGENT">("ROUTINE");
  const [uploadFor, setUploadFor] = useState<string | null>(null);
  const [kind, setKind] = useState<"lab" | "imaging">("lab");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [openReport, setOpenReport] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: orders } = useQuery({
    queryKey: ["lab-orders", patientId],
    queryFn: () => labOrdersApi.list(accessToken!, { patientId }),
    enabled: Boolean(accessToken),
  });
  const { data: reports } = useQuery({
    queryKey: ["reports", patientId],
    queryFn: () => reportsApi.list(accessToken!, { patientId }),
    enabled: Boolean(accessToken),
  });
  const myOrders = (orders ?? []).filter((o) => o.consultationId === consultationId);

  const fail = (e: unknown) => setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");

  const order = useMutation({
    mutationFn: () => labOrdersApi.create(accessToken!, { consultationId, testType: testType.trim(), priority }),
    onSuccess: () => {
      setTestType("");
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["lab-orders"] });
    },
    onError: fail,
  });

  const upload = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append("labOrderId", uploadFor!);
      form.append("type", kind);
      form.append("title", title.trim());
      form.append("file", file!);
      return reportsApi.upload(accessToken!, form);
    },
    onSuccess: (created) => {
      setUploadFor(null);
      setTitle("");
      setFile(null);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["reports"] });
      void queryClient.invalidateQueries({ queryKey: ["lab-orders"] });
      setOpenReport(created.id);
    },
    onError: fail,
  });

  return (
    <section className="flex flex-col gap-3">
      {error ? <FormAlert variant="error">{error}</FormAlert> : null}

      {canOrder ? (
        <div className="flex flex-wrap items-end gap-2">
          <TextField label="Test / study to order" value={testType} onChange={(e) => setTestType(e.target.value)} />
          <SelectField label="Priority" value={priority} onChange={(e) => setPriority(e.target.value as "ROUTINE" | "URGENT")}>
            <option value="ROUTINE">Routine</option>
            <option value="URGENT">Urgent</option>
          </SelectField>
          <Button className="w-auto" disabled={testType.trim() === ""} loading={order.isPending} onClick={() => order.mutate()}>
            Order Report
          </Button>
        </div>
      ) : null}

      {myOrders.map((o) => (
        <div key={o.id} className="flex items-center justify-between rounded border border-outline/20 p-3 text-sm">
          <span className="text-on-surface">
            {o.testType} · {o.priority === "URGENT" ? "Urgent" : "Routine"} · {o.status.replace("_", " ").toLowerCase()}
          </span>
          {canOrder && o.status !== "COMPLETED" && o.status !== "CANCELLED" ? (
            <button type="button" className="text-primary hover:underline" onClick={() => { setUploadFor(o.id); setTitle(o.testType); }}>
              Upload result
            </button>
          ) : null}
        </div>
      ))}

      {uploadFor ? (
        <div className="flex flex-col gap-2 rounded border border-outline/20 p-3">
          <SelectField label="Report type" value={kind} onChange={(e) => setKind(e.target.value as "lab" | "imaging")}>
            <option value="lab">Lab</option>
            <option value="imaging">Imaging</option>
          </SelectField>
          <TextField label="Report title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <label className="flex flex-col gap-1 text-sm font-medium text-on-surface">
            File (PDF, JPEG or PNG, max 10MB)
            <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <div className="flex gap-2">
            <Button className="w-auto" disabled={!file || title.trim() === ""} loading={upload.isPending} onClick={() => upload.mutate()}>
              Upload
            </Button>
            <Button className="w-auto" variant="secondary" onClick={() => setUploadFor(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {(reports ?? []).map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => setOpenReport(r.id)}
          className="flex items-center justify-between rounded border border-outline/20 p-3 text-left text-sm hover:bg-surface-container"
        >
          <span className="font-medium text-on-surface">{r.title}</span>
          <span className="text-on-surface-variant">{PIPELINE_LABELS[r.pipelineStatus]}</span>
        </button>
      ))}
      {myOrders.length === 0 && (reports ?? []).length === 0 ? <p className="text-on-surface-variant">No orders or reports yet.</p> : null}

      {openReport ? <ReportDetailsModal reportId={openReport} onClose={() => setOpenReport(null)} /> : null}
    </section>
  );
}
