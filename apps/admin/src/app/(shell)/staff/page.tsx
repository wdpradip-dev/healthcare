"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, FormAlert, Modal, TextField } from "@hospital/ui-web";
import { useAuth } from "@/lib/auth-provider";
import { useHospitalScope } from "@/lib/hospital-scope";
import { branchesApi, staffApi } from "@/lib/resources";

/** docs/09-ADMIN-DESIGN-MOCKUPS.md "Staff". Creation happens implicitly via
 * `POST /users/invite` (Phase 4, Users page) with a Nurse/Receptionist/Admin
 * role — this page only edits job title/branch/status. */
export default function StaffPage() {
  const { accessToken } = useAuth();
  const { selectedHospitalId } = useHospitalScope();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: staff, isLoading, isError } = useQuery({
    queryKey: ["staff", selectedHospitalId],
    queryFn: () => staffApi.list(accessToken!, selectedHospitalId),
    enabled: Boolean(accessToken),
  });

  const { data: branches } = useQuery({
    queryKey: ["branches", selectedHospitalId],
    queryFn: () => branchesApi.list(accessToken!, selectedHospitalId),
    enabled: Boolean(accessToken),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => staffApi.deactivate(accessToken!, id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["staff"] }),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-on-surface">Staff</h1>
      </div>

      {isLoading ? <p className="text-on-surface-variant">Loading…</p> : null}
      {isError ? <FormAlert variant="error">Couldn&apos;t load staff. Please try again.</FormAlert> : null}
      {!isLoading && !isError && staff?.length === 0 ? (
        <p className="text-on-surface-variant">
          No staff yet — invite a Nurse, Receptionist, or Admin from the Users page.
        </p>
      ) : null}

      {staff && staff.length > 0 ? (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-outline/30 text-on-surface-variant">
              <th className="py-2 pr-4 font-medium">Name</th>
              <th className="py-2 pr-4 font-medium">Job Title</th>
              <th className="py-2 pr-4 font-medium">Branch</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 pr-4 font-medium" />
            </tr>
          </thead>
          <tbody>
            {staff.map((member) => (
              <tr key={member.id} className="border-b border-outline/10">
                <td className="py-2 pr-4 text-on-surface">{member.user.name}</td>
                <td className="py-2 pr-4 text-on-surface-variant">{member.jobTitle ?? "—"}</td>
                <td className="py-2 pr-4 text-on-surface-variant">{member.branch?.name ?? "—"}</td>
                <td className="py-2 pr-4 text-on-surface-variant">{member.status}</td>
                <td className="py-2 pr-4 text-right">
                  <div className="flex justify-end gap-3">
                    <button type="button" onClick={() => setEditingId(member.id)} className="text-sm font-medium text-primary hover:underline">
                      Edit
                    </button>
                    {member.status !== "INACTIVE" ? (
                      <button
                        type="button"
                        onClick={() => deactivateMutation.mutate(member.id)}
                        className="text-sm font-medium text-error hover:underline"
                      >
                        Deactivate
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {editingId ? (
        <EditStaffModal
          staffId={editingId}
          member={staff!.find((s) => s.id === editingId)!}
          branches={branches ?? []}
          onClose={() => setEditingId(null)}
          onSaved={() => {
            setEditingId(null);
            void queryClient.invalidateQueries({ queryKey: ["staff"] });
          }}
        />
      ) : null}
    </div>
  );
}

function EditStaffModal({
  staffId,
  member,
  branches,
  onClose,
  onSaved,
}: {
  staffId: string;
  member: { jobTitle: string | null; branchId: string | null };
  branches: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { accessToken } = useAuth();
  const [jobTitle, setJobTitle] = useState(member.jobTitle ?? "");
  const [branchId, setBranchId] = useState(member.branchId ?? "");
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => staffApi.update(accessToken!, staffId, { jobTitle: jobTitle || undefined, branchId: branchId || null }),
    onSuccess: onSaved,
    onError: () => setFormError("Something went wrong."),
  });

  return (
    <Modal title="Edit Staff" onClose={onClose}>
      {formError ? <FormAlert variant="error">{formError}</FormAlert> : null}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
        className="flex flex-col gap-4"
      >
        <TextField label="Job title" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
        <label className="flex flex-col gap-1 text-sm text-on-surface-variant">
          Branch
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="rounded border border-outline/30 bg-transparent p-2"
          >
            <option value="">Unassigned</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex justify-end gap-3">
          <Button type="button" className="w-auto" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="w-auto" loading={mutation.isPending}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}
