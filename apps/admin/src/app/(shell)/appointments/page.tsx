"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, FormAlert, Modal, SelectField, TextField } from "@hospital/ui-web";
import { useAuth } from "@/lib/auth-provider";
import { useHospitalScope } from "@/lib/hospital-scope";
import { hasPermission } from "@/lib/permissions";
import { ApiError } from "@/lib/api-client";
import { appointmentsApi, doctorsApi, patientsApi, schedulesApi, type AppointmentStatus, type Doctor } from "@/lib/resources";
import { AppointmentDetailsModal, STATUS_LABELS, formatDateTime } from "@/components/appointments/appointment-details-modal";

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

/** docs/09-ADMIN-DESIGN-MOCKUPS.md "Appointments" / "Appointment Details" —
 * Details is a modal here, not a separate route, matching the Phase 4-6
 * list+modal convention (see doctor-schedules/page.tsx). */
export default function AppointmentsPage() {
  const { accessToken, user } = useAuth();
  const { selectedHospitalId } = useHospitalScope();
  const queryClient = useQueryClient();
  const canCreate = hasPermission(user, "appointments.create");

  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | "">("");
  const [doctorFilter, setDoctorFilter] = useState<string>("");
  const [fromFilter, setFromFilter] = useState<string>(todayDateOnly());
  const [toFilter, setToFilter] = useState<string>("");
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);

  const { data: doctors } = useQuery({
    queryKey: ["doctors", selectedHospitalId],
    queryFn: () => doctorsApi.list(accessToken!, selectedHospitalId),
    enabled: Boolean(accessToken),
  });

  const {
    data: appointments,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["appointments", selectedHospitalId, statusFilter, doctorFilter, fromFilter, toFilter],
    queryFn: () =>
      appointmentsApi.list(accessToken!, selectedHospitalId, {
        status: statusFilter || undefined,
        doctorId: doctorFilter || undefined,
        from: fromFilter || undefined,
        to: toFilter || undefined,
      }),
    enabled: Boolean(accessToken),
  });

  const invalidateList = () => void queryClient.invalidateQueries({ queryKey: ["appointments"] });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-on-surface">Appointments</h1>
        {canCreate ? (
          <Button className="w-auto" onClick={() => setIsNewOpen(true)}>
            + New Appointment
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <SelectField label="Doctor" value={doctorFilter} onChange={(e) => setDoctorFilter(e.target.value)}>
          <option value="">All doctors</option>
          {(doctors ?? []).map((d) => (
            <option key={d.id} value={d.id}>
              {d.user.name}
            </option>
          ))}
        </SelectField>
        <SelectField label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as AppointmentStatus | "")}>
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
        <TextField label="From" type="date" value={fromFilter} onChange={(e) => setFromFilter(e.target.value)} />
        <TextField label="To" type="date" value={toFilter} onChange={(e) => setToFilter(e.target.value)} />
      </div>

      {isLoading ? <p className="text-on-surface-variant">Loading…</p> : null}
      {isError ? <FormAlert variant="error">Couldn&apos;t load appointments. Please try again.</FormAlert> : null}
      {!isLoading && !isError && appointments?.length === 0 ? <p className="text-on-surface-variant">No appointments found.</p> : null}

      {appointments && appointments.length > 0 ? (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-outline/30 text-on-surface-variant">
              <th className="py-2 pr-4 font-medium">Patient</th>
              <th className="py-2 pr-4 font-medium">Doctor</th>
              <th className="py-2 pr-4 font-medium">Date/Time</th>
              <th className="py-2 pr-4 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {appointments.map((appt) => (
              <tr
                key={appt.id}
                className="cursor-pointer border-b border-outline/10 hover:bg-surface-variant/40"
                onClick={() => setSelectedAppointmentId(appt.id)}
              >
                <td className="py-2 pr-4 text-on-surface">{appt.patient.user.name}</td>
                <td className="py-2 pr-4 text-on-surface-variant">{appt.doctor.user.name}</td>
                <td className="py-2 pr-4 text-on-surface-variant">{formatDateTime(appt.startTime)}</td>
                <td className="py-2 pr-4 text-on-surface-variant">{STATUS_LABELS[appt.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {isNewOpen ? (
        <NewAppointmentModal
          doctors={doctors ?? []}
          hospitalId={selectedHospitalId}
          onClose={() => setIsNewOpen(false)}
          onCreated={() => {
            setIsNewOpen(false);
            invalidateList();
          }}
        />
      ) : null}

      {selectedAppointmentId ? (
        <AppointmentDetailsModal
          appointmentId={selectedAppointmentId}
          onClose={() => setSelectedAppointmentId(null)}
          onChanged={invalidateList}
        />
      ) : null}
    </div>
  );
}

function NewAppointmentModal({
  doctors,
  hospitalId,
  onClose,
  onCreated,
}: {
  doctors: Doctor[];
  hospitalId: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { accessToken } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const [doctorId, setDoctorId] = useState(doctors[0]?.id ?? "");
  const [departmentId, setDepartmentId] = useState(doctors[0]?.doctorDepartments[0]?.departmentId ?? "");
  const [patientId, setPatientId] = useState("");
  const [date, setDate] = useState(todayDateOnly());
  const [startTime, setStartTime] = useState("");
  const [reason, setReason] = useState("");

  const selectedDoctor = doctors.find((d) => d.id === doctorId);
  const departmentChoices = selectedDoctor?.doctorDepartments ?? [];

  const { data: patients } = useQuery({
    queryKey: ["patients", hospitalId],
    queryFn: () => patientsApi.list(accessToken!, hospitalId),
    enabled: Boolean(accessToken),
  });

  const { data: availability, isFetching: isAvailabilityLoading } = useQuery({
    queryKey: ["availability", doctorId, departmentId, date],
    queryFn: () => schedulesApi.getAvailability(accessToken!, doctorId, date, date, departmentId || undefined),
    enabled: Boolean(accessToken) && Boolean(doctorId) && Boolean(date),
  });
  const slots = availability?.days[0]?.slots ?? [];

  const mutation = useMutation({
    mutationFn: () =>
      appointmentsApi.create(accessToken!, {
        hospitalId: hospitalId ?? undefined,
        doctorId,
        departmentId,
        patientId,
        startTime,
        reason: reason || undefined,
      }),
    onSuccess: onCreated,
    onError: (error) => setFormError(error instanceof ApiError ? error.message : "Something went wrong."),
  });

  return (
    <Modal title="New Appointment" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
        className="flex flex-col gap-4"
        noValidate
      >
        {formError ? <FormAlert variant="error">{formError}</FormAlert> : null}

        <SelectField
          label="Doctor"
          value={doctorId}
          onChange={(e) => {
            setDoctorId(e.target.value);
            const next = doctors.find((d) => d.id === e.target.value);
            setDepartmentId(next?.doctorDepartments[0]?.departmentId ?? "");
            setStartTime("");
          }}
        >
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.user.name}
            </option>
          ))}
        </SelectField>

        <SelectField
          label="Department"
          value={departmentId}
          onChange={(e) => {
            setDepartmentId(e.target.value);
            setStartTime("");
          }}
        >
          {departmentChoices.map((dd) => (
            <option key={dd.departmentId} value={dd.departmentId}>
              {dd.department.name}
            </option>
          ))}
        </SelectField>

        <SelectField label="Patient" value={patientId} onChange={(e) => setPatientId(e.target.value)}>
          <option value="">Select a patient…</option>
          {(patients ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.user.name}
            </option>
          ))}
        </SelectField>

        <TextField
          label="Date"
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setStartTime("");
          }}
        />

        <SelectField label="Time slot" value={startTime} onChange={(e) => setStartTime(e.target.value)}>
          <option value="">{isAvailabilityLoading ? "Loading…" : slots.length === 0 ? "No open slots this day" : "Select a time…"}</option>
          {slots.map((slot) => (
            <option key={slot.startTime} value={slot.startTime}>
              {new Date(slot.startTime).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
            </option>
          ))}
        </SelectField>

        <TextField label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />

        <Button type="submit" loading={mutation.isPending} disabled={!doctorId || !departmentId || !patientId || !startTime}>
          Book Appointment
        </Button>
      </form>
    </Modal>
  );
}
