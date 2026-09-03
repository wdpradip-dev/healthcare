"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createDoctorSchema, type CreateDoctorInput } from "@hospital/validation";
import { Button, FormAlert, Modal, SelectField, TextField } from "@hospital/ui-web";
import { useAuth } from "@/lib/auth-provider";
import { useHospitalScope } from "@/lib/hospital-scope";
import { ApiError } from "@/lib/api-client";
import { departmentsApi, doctorsApi, usersApi, type Doctor } from "@/lib/resources";

/** docs/09-ADMIN-DESIGN-MOCKUPS.md "Doctors" — Profile-level fields only;
 * the Schedule/Patients/Reviews detail tabs need Phase 6/7/8 data. */
export default function DoctorsPage() {
  const { accessToken } = useAuth();
  const { selectedHospitalId } = useHospitalScope();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const { data: doctors, isLoading, isError } = useQuery({
    queryKey: ["doctors", selectedHospitalId],
    queryFn: () => doctorsApi.list(accessToken!, selectedHospitalId),
    enabled: Boolean(accessToken),
  });

  const { data: departments } = useQuery({
    queryKey: ["departments", selectedHospitalId],
    queryFn: () => departmentsApi.list(accessToken!, selectedHospitalId),
    enabled: Boolean(accessToken),
  });

  const { data: invitedDoctorUsers } = useQuery({
    queryKey: ["users", selectedHospitalId, "DOCTOR"],
    queryFn: () => usersApi.list(accessToken!, selectedHospitalId, { role: "DOCTOR" }),
    enabled: Boolean(accessToken) && isCreateOpen,
  });

  const unassignedDoctorUsers = useMemo(() => {
    const assignedUserIds = new Set((doctors ?? []).map((d) => d.userId));
    return (invitedDoctorUsers ?? []).filter((u) => !assignedUserIds.has(u.id));
  }, [invitedDoctorUsers, doctors]);

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Doctor["status"] }) => doctorsApi.update(accessToken!, id, { status }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["doctors"] }),
  });

  const assignDepartmentMutation = useMutation({
    mutationFn: ({ id, departmentId }: { id: string; departmentId: string }) =>
      doctorsApi.assignDepartment(accessToken!, id, { departmentId }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["doctors"] }),
  });

  const removeDepartmentMutation = useMutation({
    mutationFn: ({ id, departmentId }: { id: string; departmentId: string }) =>
      doctorsApi.removeDepartment(accessToken!, id, departmentId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["doctors"] }),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-on-surface">Doctors</h1>
        <Button className="w-auto" onClick={() => setIsCreateOpen(true)}>
          + Add Doctor
        </Button>
      </div>

      {isLoading ? <p className="text-on-surface-variant">Loading…</p> : null}
      {isError ? <FormAlert variant="error">Couldn&apos;t load doctors. Please try again.</FormAlert> : null}
      {!isLoading && !isError && doctors?.length === 0 ? (
        <p className="text-on-surface-variant">No doctors yet — add the first one.</p>
      ) : null}

      {doctors && doctors.length > 0 ? (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-outline/30 text-on-surface-variant">
              <th className="py-2 pr-4 font-medium">Name</th>
              <th className="py-2 pr-4 font-medium">Qualifications</th>
              <th className="py-2 pr-4 font-medium">Departments</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 pr-4 font-medium">Assign Department</th>
            </tr>
          </thead>
          <tbody>
            {doctors.map((doctor) => {
              const assignedDeptIds = new Set(doctor.doctorDepartments.map((dd) => dd.departmentId));
              const assignableDepartments = (departments ?? []).filter((d) => !assignedDeptIds.has(d.id));
              return (
                <tr key={doctor.id} className="border-b border-outline/10 align-top">
                  <td className="py-2 pr-4 text-on-surface">{doctor.user.name}</td>
                  <td className="py-2 pr-4 text-on-surface-variant">{doctor.qualifications}</td>
                  <td className="py-2 pr-4 text-on-surface-variant">
                    <div className="flex flex-wrap gap-1">
                      {doctor.doctorDepartments.length === 0 ? <span>—</span> : null}
                      {doctor.doctorDepartments.map((dd) => (
                        <span
                          key={dd.departmentId}
                          className="inline-flex items-center gap-1 rounded-full bg-surface-variant px-2 py-0.5"
                        >
                          {dd.department.name}
                          <button
                            type="button"
                            aria-label={`Remove ${dd.department.name}`}
                            onClick={() => removeDepartmentMutation.mutate({ id: doctor.id, departmentId: dd.departmentId })}
                            className="text-error"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-2 pr-4 text-on-surface-variant">
                    <select
                      aria-label={`Status for ${doctor.user.name}`}
                      value={doctor.status}
                      onChange={(e) => statusMutation.mutate({ id: doctor.id, status: e.target.value as Doctor["status"] })}
                      className="rounded border border-outline/30 bg-transparent py-1"
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive</option>
                      <option value="ON_LEAVE">On Leave</option>
                    </select>
                  </td>
                  <td className="py-2 pr-4">
                    {assignableDepartments.length > 0 ? (
                      <select
                        aria-label={`Assign department to ${doctor.user.name}`}
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value) {
                            assignDepartmentMutation.mutate({ id: doctor.id, departmentId: e.target.value });
                            e.target.value = "";
                          }
                        }}
                        className="rounded border border-outline/30 bg-transparent py-1"
                      >
                        <option value="" disabled>
                          Select…
                        </option>
                        {assignableDepartments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-on-surface-variant">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}

      {isCreateOpen ? (
        <CreateDoctorModal
          hospitalId={selectedHospitalId}
          invitedDoctorUsers={unassignedDoctorUsers}
          onClose={() => setIsCreateOpen(false)}
          onCreated={() => {
            setIsCreateOpen(false);
            void queryClient.invalidateQueries({ queryKey: ["doctors"] });
          }}
        />
      ) : null}
    </div>
  );
}

function CreateDoctorModal({
  hospitalId,
  invitedDoctorUsers,
  onClose,
  onCreated,
}: {
  hospitalId: string | null;
  invitedDoctorUsers: { id: string; name: string; email: string | null }[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { accessToken } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateDoctorInput>({
    resolver: zodResolver(createDoctorSchema),
    defaultValues: { userId: invitedDoctorUsers[0]?.id },
  });

  const mutation = useMutation({
    mutationFn: (input: CreateDoctorInput) => doctorsApi.create(accessToken!, hospitalId ? { ...input, hospitalId } : input),
    onSuccess: onCreated,
    onError: (error) => setFormError(error instanceof ApiError ? error.message : "Something went wrong."),
  });

  return (
    <Modal title="Add Doctor" onClose={onClose}>
      {invitedDoctorUsers.length === 0 ? (
        <p className="text-on-surface-variant">
          No invited Doctor-role users are available. Invite one first from the Users page (role: Doctor), then come back here
          to attach their clinical profile.
        </p>
      ) : (
        <form onSubmit={handleSubmit((input) => mutation.mutate(input))} className="flex flex-col gap-4" noValidate>
          {formError ? <FormAlert variant="error">{formError}</FormAlert> : null}
          <SelectField label="Invited Doctor" error={errors.userId?.message} {...register("userId")}>
            {invitedDoctorUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.email})
              </option>
            ))}
          </SelectField>
          <TextField label="Qualifications" error={errors.qualifications?.message} {...register("qualifications")} />
          <TextField
            label="Years of experience (optional)"
            type="number"
            error={errors.yearsOfExperience?.message}
            {...register("yearsOfExperience", { setValueAs: (v) => (v === "" ? undefined : Number(v)) })}
          />
          <TextField
            label="Consultation fee (optional)"
            type="number"
            error={errors.consultationFee?.message}
            {...register("consultationFee", { setValueAs: (v) => (v === "" ? undefined : Number(v)) })}
          />
          <Button type="submit" loading={isSubmitting || mutation.isPending}>
            Create Doctor Profile
          </Button>
        </form>
      )}
    </Modal>
  );
}
