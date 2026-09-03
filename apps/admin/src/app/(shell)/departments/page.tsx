"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createDepartmentSchema, type CreateDepartmentInput } from "@hospital/validation";
import { Button, FormAlert, Modal, SelectField, TextField } from "@hospital/ui-web";
import { useAuth } from "@/lib/auth-provider";
import { useHospitalScope } from "@/lib/hospital-scope";
import { ApiError } from "@/lib/api-client";
import { branchesApi, departmentsApi } from "@/lib/resources";

/** docs/09-ADMIN-DESIGN-MOCKUPS.md "Departments". */
export default function DepartmentsPage() {
  const { accessToken } = useAuth();
  const { selectedHospitalId } = useHospitalScope();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const { data: branches } = useQuery({
    queryKey: ["branches", selectedHospitalId],
    queryFn: () => branchesApi.list(accessToken!, selectedHospitalId),
    enabled: Boolean(accessToken),
  });

  const { data: departments, isLoading, isError } = useQuery({
    queryKey: ["departments", selectedHospitalId],
    queryFn: () => departmentsApi.list(accessToken!, selectedHospitalId),
    enabled: Boolean(accessToken),
  });

  const branchName = (branchId: string) => branches?.find((b) => b.id === branchId)?.name ?? "—";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-on-surface">Departments</h1>
        <Button className="w-auto" onClick={() => setIsCreateOpen(true)} disabled={!branches?.length}>
          + Add Department
        </Button>
      </div>

      {isLoading ? <p className="text-on-surface-variant">Loading…</p> : null}
      {isError ? <FormAlert variant="error">Couldn&apos;t load departments. Please try again.</FormAlert> : null}
      {!isLoading && !isError && departments?.length === 0 ? (
        <p className="text-on-surface-variant">
          {branches?.length ? "No departments yet — add the first one." : "Add a branch first, then departments."}
        </p>
      ) : null}

      {departments && departments.length > 0 ? (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-outline/30 text-on-surface-variant">
              <th className="py-2 pr-4 font-medium">Name</th>
              <th className="py-2 pr-4 font-medium">Branch</th>
              <th className="py-2 pr-4 font-medium">Doctors</th>
              <th className="py-2 pr-4 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {departments.map((department) => (
              <tr key={department.id} className="border-b border-outline/10">
                <td className="py-2 pr-4 text-on-surface">{department.name}</td>
                <td className="py-2 pr-4 text-on-surface-variant">{branchName(department.branchId)}</td>
                <td className="py-2 pr-4 text-on-surface-variant">{department.doctorDepartments?.length ?? 0}</td>
                <td className="py-2 pr-4 text-on-surface-variant">{department.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {isCreateOpen && branches ? (
        <CreateDepartmentModal
          hospitalId={selectedHospitalId}
          branches={branches}
          onClose={() => setIsCreateOpen(false)}
          onCreated={() => {
            setIsCreateOpen(false);
            void queryClient.invalidateQueries({ queryKey: ["departments"] });
          }}
        />
      ) : null}
    </div>
  );
}

function CreateDepartmentModal({
  hospitalId,
  branches,
  onClose,
  onCreated,
}: {
  hospitalId: string | null;
  branches: { id: string; name: string }[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { accessToken } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateDepartmentInput>({
    resolver: zodResolver(createDepartmentSchema),
    defaultValues: { branchId: branches[0]?.id },
  });

  const mutation = useMutation({
    mutationFn: (input: CreateDepartmentInput) =>
      departmentsApi.create(accessToken!, hospitalId ? { ...input, hospitalId } : input),
    onSuccess: onCreated,
    onError: (error) => setFormError(error instanceof ApiError ? error.message : "Something went wrong."),
  });

  return (
    <Modal title="Add Department" onClose={onClose}>
      <form onSubmit={handleSubmit((input) => mutation.mutate(input))} className="flex flex-col gap-4" noValidate>
        {formError ? <FormAlert variant="error">{formError}</FormAlert> : null}
        <SelectField label="Branch" error={errors.branchId?.message} {...register("branchId")}>
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </SelectField>
        <TextField label="Name" error={errors.name?.message} {...register("name")} />
        <TextField label="Description (optional)" error={errors.description?.message} {...register("description")} />
        <Button type="submit" loading={isSubmitting || mutation.isPending}>
          Create Department
        </Button>
      </form>
    </Modal>
  );
}
