"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FormAlert, SelectField } from "@hospital/ui-web";
import { useAuth } from "@/lib/auth-provider";
import { ApiError, resolveFileUrl } from "@/lib/api-client";
import { documentsApi } from "@/lib/resources";
import { formatDateTime } from "@/components/appointments/appointment-details-modal";

const CATEGORY_LABELS: Record<string, string> = {
  REPORT_ATTACHMENT: "Report file",
  PRESCRIPTION_PDF: "Prescription PDF",
  ID_PROOF: "ID proof",
  INSURANCE: "Insurance",
  OTHER: "Other",
};

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** docs/09 "Documents" — every open is a signed, short-lived, audited download. */
export default function DocumentsPage() {
  const { accessToken } = useAuth();
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: documents, isLoading, isError } = useQuery({
    queryKey: ["documents", category],
    queryFn: () => documentsApi.list(accessToken!, { category }),
    enabled: Boolean(accessToken),
  });

  const download = useMutation({
    mutationFn: (id: string) => documentsApi.downloadUrl(accessToken!, id),
    onSuccess: ({ url }) => {
      setError(null);
      window.open(resolveFileUrl(url), "_blank", "noopener,noreferrer");
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Couldn't open the document."),
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-on-surface">Documents</h1>
      <SelectField label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
        <option value="">All</option>
        {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </SelectField>

      {error ? <FormAlert variant="error">{error}</FormAlert> : null}
      {isError ? <FormAlert variant="error">Couldn&apos;t load documents.</FormAlert> : null}
      {isLoading ? <p className="text-on-surface-variant">Loading…</p> : null}
      {documents && documents.length === 0 ? <p className="text-on-surface-variant">No documents found.</p> : null}
      {documents && documents.length > 0 ? (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-on-surface-variant">
              <th className="py-2">File</th>
              <th>Category</th>
              <th>Size</th>
              <th>Added</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((d) => (
              <tr key={d.id} className="border-t border-outline/10">
                <td className="py-2">
                  <button type="button" className="text-primary hover:underline" onClick={() => download.mutate(d.id)}>
                    {d.fileName}
                  </button>
                </td>
                <td>{CATEGORY_LABELS[d.category]}</td>
                <td>{formatSize(d.sizeBytes)}</td>
                <td>{formatDateTime(d.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
