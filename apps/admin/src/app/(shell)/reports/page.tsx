"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FormAlert, SelectField } from "@hospital/ui-web";
import { useAuth } from "@/lib/auth-provider";
import { reportsApi } from "@/lib/resources";
import { PIPELINE_LABELS, ReportDetailsModal } from "@/components/reports/report-details-modal";
import { formatDateTime } from "@/components/appointments/appointment-details-modal";

/** docs/09-ADMIN-DESIGN-MOCKUPS.md "Reports" — the cross-patient queue; Report Details is a modal, matching the list+modal convention. */
export default function ReportsPage() {
  const { accessToken } = useAuth();
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: reports, isLoading, isError } = useQuery({
    queryKey: ["reports", "all", type, status],
    queryFn: () => reportsApi.list(accessToken!, { type, status }),
    enabled: Boolean(accessToken),
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-on-surface">Reports</h1>
      <div className="flex gap-3">
        <SelectField label="Type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All</option>
          <option value="lab">Lab</option>
          <option value="imaging">Imaging</option>
        </SelectField>
        <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All</option>
          {Object.entries(PIPELINE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
      </div>

      {isError ? <FormAlert variant="error">Couldn&apos;t load reports.</FormAlert> : null}
      {isLoading ? <p className="text-on-surface-variant">Loading…</p> : null}
      {reports && reports.length === 0 ? <p className="text-on-surface-variant">No reports found.</p> : null}
      {reports && reports.length > 0 ? (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-on-surface-variant">
              <th className="py-2">Patient</th>
              <th>Report</th>
              <th>Type</th>
              <th>Status</th>
              <th>Uploaded</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id} className="border-t border-outline/10">
                <td className="py-2">{r.patientName}</td>
                <td>
                  <button type="button" className="text-primary hover:underline" onClick={() => setOpenId(r.id)}>
                    {r.title}
                  </button>
                </td>
                <td>{r.type === "lab" ? "Lab" : "Imaging"}</td>
                <td>{PIPELINE_LABELS[r.pipelineStatus]}</td>
                <td>{formatDateTime(r.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {openId ? <ReportDetailsModal reportId={openId} onClose={() => setOpenId(null)} /> : null}
    </div>
  );
}
