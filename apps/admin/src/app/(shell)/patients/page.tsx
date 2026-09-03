"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registerPatientSchema, type RegisterPatientInput } from "@hospital/validation";
import { Button, FormAlert, Modal, TextField } from "@hospital/ui-web";
import { useAuth } from "@/lib/auth-provider";
import { useHospitalScope } from "@/lib/hospital-scope";
import { ApiError } from "@/lib/api-client";
import { patientsApi } from "@/lib/resources";

/** docs/09-ADMIN-DESIGN-MOCKUPS.md "Patients" — Overview fields only; the
 * Appointments/Medical History/Documents detail tabs need Phase 6/7/8 data. */
export default function PatientsPage() {
  const { accessToken } = useAuth();
  const { selectedHospitalId } = useHospitalScope();
  const queryClient = useQueryClient();
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);

  const { data: patients, isLoading, isError } = useQuery({
    queryKey: ["patients", selectedHospitalId],
    queryFn: () => patientsApi.list(accessToken!, selectedHospitalId),
    enabled: Boolean(accessToken),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-on-surface">Patients</h1>
        <Button className="w-auto" onClick={() => setIsRegisterOpen(true)}>
          + Register Patient
        </Button>
      </div>

      {isLoading ? <p className="text-on-surface-variant">Loading…</p> : null}
      {isError ? <FormAlert variant="error">Couldn&apos;t load patients. Please try again.</FormAlert> : null}
      {!isLoading && !isError && patients?.length === 0 ? (
        <p className="text-on-surface-variant">No patients registered at this hospital yet.</p>
      ) : null}

      {patients && patients.length > 0 ? (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-outline/30 text-on-surface-variant">
              <th className="py-2 pr-4 font-medium">Name</th>
              <th className="py-2 pr-4 font-medium">Contact</th>
              <th className="py-2 pr-4 font-medium">Registered Branch</th>
              <th className="py-2 pr-4 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {patients.map((patient) => (
              <tr key={patient.id} className="border-b border-outline/10">
                <td className="py-2 pr-4 text-on-surface">{patient.user.name}</td>
                <td className="py-2 pr-4 text-on-surface-variant">{patient.user.email ?? patient.user.phone}</td>
                <td className="py-2 pr-4 text-on-surface-variant">{patient.registeredBranch?.name ?? "—"}</td>
                <td className="py-2 pr-4 text-on-surface-variant">{patient.user.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {isRegisterOpen ? (
        <RegisterPatientModal
          hospitalId={selectedHospitalId}
          onClose={() => setIsRegisterOpen(false)}
          onRegistered={() => {
            setIsRegisterOpen(false);
            void queryClient.invalidateQueries({ queryKey: ["patients"] });
          }}
        />
      ) : null}
    </div>
  );
}

function RegisterPatientModal({
  hospitalId,
  onClose,
  onRegistered,
}: {
  hospitalId: string | null;
  onClose: () => void;
  onRegistered: () => void;
}) {
  const { accessToken } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterPatientInput>({ resolver: zodResolver(registerPatientSchema) });

  const mutation = useMutation({
    mutationFn: (input: RegisterPatientInput) => patientsApi.register(accessToken!, hospitalId ? { ...input, hospitalId } : input),
    onSuccess: onRegistered,
    onError: (error) => setFormError(error instanceof ApiError ? error.message : "Something went wrong."),
  });

  return (
    <Modal title="Register Patient" onClose={onClose}>
      <form onSubmit={handleSubmit((input) => mutation.mutate(input))} className="flex flex-col gap-4" noValidate>
        {formError ? <FormAlert variant="error">{formError}</FormAlert> : null}
        <TextField label="Full name" error={errors.name?.message} {...register("name")} />
        <TextField label="Email" error={errors.email?.message} {...register("email")} />
        <TextField
          label="Phone (optional)"
          error={errors.phone?.message}
          {...register("phone", { setValueAs: (v) => (v === "" ? undefined : v) })}
        />
        <TextField
          label="Date of birth (optional)"
          type="date"
          error={errors.dateOfBirth?.message}
          {...register("dateOfBirth", { setValueAs: (v) => (v === "" ? undefined : v) })}
        />
        <Button type="submit" loading={isSubmitting || mutation.isPending}>
          Register Patient
        </Button>
      </form>
    </Modal>
  );
}
