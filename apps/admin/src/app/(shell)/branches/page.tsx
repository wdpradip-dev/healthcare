"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createBranchSchema, type CreateBranchInput } from "@hospital/validation";
import { Button, FormAlert, Modal, TextField } from "@hospital/ui-web";
import { useAuth } from "@/lib/auth-provider";
import { useHospitalScope } from "@/lib/hospital-scope";
import { ApiError } from "@/lib/api-client";
import { branchesApi } from "@/lib/resources";

/** docs/09-ADMIN-DESIGN-MOCKUPS.md "Branches". */
export default function BranchesPage() {
  const { accessToken } = useAuth();
  const { selectedHospitalId } = useHospitalScope();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const { data: branches, isLoading, isError } = useQuery({
    queryKey: ["branches", selectedHospitalId],
    queryFn: () => branchesApi.list(accessToken!, selectedHospitalId),
    enabled: Boolean(accessToken),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-on-surface">Branches</h1>
        <Button className="w-auto" onClick={() => setIsCreateOpen(true)}>
          + Add Branch
        </Button>
      </div>

      {isLoading ? <p className="text-on-surface-variant">Loading…</p> : null}
      {isError ? <FormAlert variant="error">Couldn&apos;t load branches. Please try again.</FormAlert> : null}
      {!isLoading && !isError && branches?.length === 0 ? (
        <p className="text-on-surface-variant">No branches yet — add the first one to get started.</p>
      ) : null}

      {branches && branches.length > 0 ? (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-outline/30 text-on-surface-variant">
              <th className="py-2 pr-4 font-medium">Name</th>
              <th className="py-2 pr-4 font-medium">Address</th>
              <th className="py-2 pr-4 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {branches.map((branch) => (
              <tr key={branch.id} className="border-b border-outline/10">
                <td className="py-2 pr-4 text-on-surface">{branch.name}</td>
                <td className="py-2 pr-4 text-on-surface-variant">
                  {branch.address}, {branch.city}
                </td>
                <td className="py-2 pr-4 text-on-surface-variant">{branch.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {isCreateOpen ? (
        <CreateBranchModal
          hospitalId={selectedHospitalId}
          onClose={() => setIsCreateOpen(false)}
          onCreated={() => {
            setIsCreateOpen(false);
            void queryClient.invalidateQueries({ queryKey: ["branches"] });
          }}
        />
      ) : null}
    </div>
  );
}

function CreateBranchModal({
  hospitalId,
  onClose,
  onCreated,
}: {
  hospitalId: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { accessToken } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateBranchInput>({ resolver: zodResolver(createBranchSchema), defaultValues: { operatingHours: {} } });

  const mutation = useMutation({
    mutationFn: (input: CreateBranchInput) =>
      branchesApi.create(accessToken!, hospitalId ? { ...input, hospitalId } : input),
    onSuccess: onCreated,
    onError: (error) => setFormError(error instanceof ApiError ? error.message : "Something went wrong."),
  });

  return (
    <Modal title="Add Branch" onClose={onClose}>
      <form onSubmit={handleSubmit((input) => mutation.mutate(input))} className="flex flex-col gap-4" noValidate>
        {formError ? <FormAlert variant="error">{formError}</FormAlert> : null}
        <TextField label="Name" error={errors.name?.message} {...register("name")} />
        <TextField label="Address" error={errors.address?.message} {...register("address")} />
        <div className="grid grid-cols-2 gap-4">
          <TextField label="City" error={errors.city?.message} {...register("city")} />
          <TextField label="State" error={errors.state?.message} {...register("state")} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <TextField label="Postal code" error={errors.postalCode?.message} {...register("postalCode")} />
          <TextField label="Country" error={errors.country?.message} {...register("country")} />
        </div>
        <TextField label="Contact phone" error={errors.contactPhone?.message} {...register("contactPhone")} />
        <Button type="submit" loading={isSubmitting || mutation.isPending}>
          Create Branch
        </Button>
      </form>
    </Modal>
  );
}
