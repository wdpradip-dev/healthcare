"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registerPatientSchema, type RegisterPatientInput } from "@hospital/validation";
import { Button, FormAlert, Modal, TextField } from "@hospital/ui-web";
import { useAuth } from "@/lib/auth-provider";
import { hasPermission } from "@/lib/permissions";
import { useHospitalScope } from "@/lib/hospital-scope";
import { ApiError } from "@/lib/api-client";
import { medicalRecordsApi, patientsApi, type Patient } from "@/lib/resources";

/** docs/09-ADMIN-DESIGN-MOCKUPS.md "Patients" — Overview fields only; the
 * Appointments/Medical History/Documents detail tabs need Phase 6/7/8 data. */
export default function PatientsPage() {
  const { accessToken, user } = useAuth();
  const { selectedHospitalId } = useHospitalScope();
  const queryClient = useQueryClient();
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [historyPatient, setHistoryPatient] = useState<Patient | null>(null);
  const canViewHistory = hasPermission(user, "medical_records.read");

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
              {canViewHistory ? <th className="py-2 pr-4 font-medium" /> : null}
            </tr>
          </thead>
          <tbody>
            {patients.map((patient) => (
              <tr key={patient.id} className="border-b border-outline/10">
                <td className="py-2 pr-4 text-on-surface">{patient.user.name}</td>
                <td className="py-2 pr-4 text-on-surface-variant">{patient.user.email ?? patient.user.phone}</td>
                <td className="py-2 pr-4 text-on-surface-variant">{patient.registeredBranch?.name ?? "—"}</td>
                <td className="py-2 pr-4 text-on-surface-variant">{patient.user.status}</td>
                {canViewHistory ? (
                  <td className="py-2 pr-4 text-right">
                    <button type="button" onClick={() => setHistoryPatient(patient)} className="text-sm font-medium text-primary hover:underline">
                      Medical History
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {historyPatient ? <MedicalHistoryModal patient={historyPatient} onClose={() => setHistoryPatient(null)} /> : null}

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

/** docs/09-ADMIN-DESIGN-MOCKUPS.md "Patient Details > Medical History tab
 * (read-only oversight)" — a modal here, matching every other admin screen's
 * list+modal convention rather than a separate Patient Details route. Reports
 * join the timeline in Phase 9. */
function MedicalHistoryModal({ patient, onClose }: { patient: Patient; onClose: () => void }) {
  const { accessToken } = useAuth();
  const enabled = Boolean(accessToken);

  const records = useQuery({
    queryKey: ["medical-records", patient.id],
    queryFn: () => medicalRecordsApi.list(accessToken!, patient.id),
    enabled,
  });
  const allergies = useQuery({
    queryKey: ["allergies", patient.id],
    queryFn: () => medicalRecordsApi.allergies(accessToken!, patient.id),
    enabled,
  });
  const conditions = useQuery({
    queryKey: ["conditions", patient.id],
    queryFn: () => medicalRecordsApi.conditions(accessToken!, patient.id),
    enabled,
  });

  return (
    <Modal title={`Medical History — ${patient.user.name}`} onClose={onClose}>
      <div className="flex flex-col gap-4 text-sm">
        {records.isError ? <FormAlert variant="error">Couldn&apos;t load this patient&apos;s records.</FormAlert> : null}

        <section>
          <h3 className="mb-1 font-medium text-on-surface">Allergies</h3>
          {allergies.data?.length ? (
            <ul className="flex flex-col gap-1 text-on-surface-variant">
              {allergies.data.map((a) => (
                <li key={a.id}>
                  {a.allergen} — {a.severity}
                  {a.reaction ? ` (${a.reaction})` : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-on-surface-variant">None recorded.</p>
          )}
        </section>

        <section>
          <h3 className="mb-1 font-medium text-on-surface">Conditions</h3>
          {conditions.data?.length ? (
            <ul className="flex flex-col gap-1 text-on-surface-variant">
              {conditions.data.map((c) => (
                <li key={c.id}>
                  {c.name} — {c.status}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-on-surface-variant">None recorded.</p>
          )}
        </section>

        <section>
          <h3 className="mb-1 font-medium text-on-surface">Consultations</h3>
          {records.isLoading ? <p className="text-on-surface-variant">Loading…</p> : null}
          {records.data?.length === 0 ? <p className="text-on-surface-variant">No consultations at this hospital yet.</p> : null}
          <ul className="flex flex-col gap-1 text-on-surface-variant">
            {(records.data ?? []).map((r) => (
              <li key={r.id}>
                {r.date ? new Date(r.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—"} · Consultation ·{" "}
                {r.doctor.name}
                {r.diagnoses.length > 0 ? ` · ${r.diagnoses.map((d) => d.description).join(", ")}` : ""}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Modal>
  );
}
