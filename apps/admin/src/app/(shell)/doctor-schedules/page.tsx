"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createScheduleExceptionSchema,
  replaceDoctorScheduleSchema,
  type CreateScheduleExceptionInput,
  type ReplaceDoctorScheduleInput,
} from "@hospital/validation";
import { Button, FormAlert, Modal, SelectField, TextField } from "@hospital/ui-web";
import { useAuth } from "@/lib/auth-provider";
import { useHospitalScope } from "@/lib/hospital-scope";
import { hasPermission } from "@/lib/permissions";
import { ApiError } from "@/lib/api-client";
import { doctorsApi, schedulesApi, type DoctorScheduleRow } from "@/lib/resources";

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** docs/09-ADMIN-DESIGN-MOCKUPS.md "Doctor Schedules" — Weekly Template +
 * Upcoming Exceptions on one screen, matching that mockup exactly (the
 * doc's separate "Schedule Exceptions" mockup is the Add Exception form,
 * not a second list screen). The conflict-resolution flow the mockup shows
 * ("Notify & Reschedule"/"Notify & Cancel") needs Appointment endpoints
 * that don't exist until Phase 7 — creating an exception that would orphan
 * existing appointments is rejected outright for now (SCHEDULE_EXCEPTION_CONFLICT). */
export default function DoctorSchedulesPage() {
  const { accessToken, user } = useAuth();
  const { selectedHospitalId } = useHospitalScope();
  const queryClient = useQueryClient();
  const canWrite = hasPermission(user, "schedules.write");
  const isDoctorSelf = (user?.roles[0] ?? "") === "DOCTOR";

  const [selectedDoctorId, setSelectedDoctorId] = useState<string | null>(isDoctorSelf ? (user?.doctorId ?? null) : null);
  const [isEditTemplateOpen, setIsEditTemplateOpen] = useState(false);
  const [isAddExceptionOpen, setIsAddExceptionOpen] = useState(false);

  const { data: doctors } = useQuery({
    queryKey: ["doctors", selectedHospitalId],
    queryFn: () => doctorsApi.list(accessToken!, selectedHospitalId),
    enabled: Boolean(accessToken) && !isDoctorSelf,
  });

  useEffect(() => {
    if (!isDoctorSelf && !selectedDoctorId && doctors && doctors.length > 0) {
      setSelectedDoctorId(doctors[0]!.id);
    }
  }, [doctors, isDoctorSelf, selectedDoctorId]);

  const { data: template, isLoading: isTemplateLoading } = useQuery({
    queryKey: ["schedule-template", selectedDoctorId],
    queryFn: () => schedulesApi.getTemplate(accessToken!, selectedDoctorId!),
    enabled: Boolean(accessToken) && Boolean(selectedDoctorId),
  });

  const { data: exceptions } = useQuery({
    queryKey: ["schedule-exceptions", selectedDoctorId],
    queryFn: () => schedulesApi.listExceptions(accessToken!, selectedDoctorId!),
    enabled: Boolean(accessToken) && Boolean(selectedDoctorId),
  });

  const deleteExceptionMutation = useMutation({
    mutationFn: (exceptionId: string) => schedulesApi.deleteException(accessToken!, selectedDoctorId!, exceptionId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["schedule-exceptions", selectedDoctorId] }),
  });

  const selectedDoctor = doctors?.find((d) => d.id === selectedDoctorId);
  // Department choices: the full doctor record (Admin/staff path) if
  // available, else derived from the doctor's own existing template rows
  // (the only source a DOCTOR-role self-service session has, since that
  // role holds no doctors.read at all — see docs/15-API-SPECIFICATION.md
  // "/auth" GET /auth/me).
  const departmentChoices = selectedDoctor
    ? selectedDoctor.doctorDepartments.map((dd) => dd.department)
    : uniqueDepartments(template ?? []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-on-surface">Doctor Schedules</h1>
        {!isDoctorSelf ? (
          <select
            aria-label="Doctor"
            value={selectedDoctorId ?? ""}
            onChange={(e) => setSelectedDoctorId(e.target.value || null)}
            className="rounded border border-outline/30 bg-transparent px-3 py-2"
          >
            {(doctors ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.user.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {!selectedDoctorId ? <p className="text-on-surface-variant">Select a doctor to view their schedule.</p> : null}

      {selectedDoctorId ? (
        <>
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium text-on-surface">Weekly Template</h2>
              {canWrite ? (
                <Button className="w-auto" onClick={() => setIsEditTemplateOpen(true)}>
                  Edit Template
                </Button>
              ) : null}
            </div>
            {isTemplateLoading ? <p className="text-on-surface-variant">Loading…</p> : null}
            {!isTemplateLoading && template?.length === 0 ? (
              <p className="text-on-surface-variant">No schedule set yet.</p>
            ) : null}
            {template && template.length > 0 ? (
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-outline/30 text-on-surface-variant">
                    <th className="py-2 pr-4 font-medium">Day</th>
                    <th className="py-2 pr-4 font-medium">Hours</th>
                    <th className="py-2 pr-4 font-medium">Department</th>
                    <th className="py-2 pr-4 font-medium">Slot</th>
                    <th className="py-2 pr-4 font-medium">Buffer</th>
                    <th className="py-2 pr-4 font-medium">Max/day</th>
                  </tr>
                </thead>
                <tbody>
                  {template.map((row) => (
                    <tr key={row.id} className="border-b border-outline/10">
                      <td className="py-2 pr-4 text-on-surface">{DAY_LABELS[row.dayOfWeek]}</td>
                      <td className="py-2 pr-4 text-on-surface-variant">
                        {row.startTime}–{row.endTime}
                      </td>
                      <td className="py-2 pr-4 text-on-surface-variant">{row.department.name}</td>
                      <td className="py-2 pr-4 text-on-surface-variant">{row.slotDurationMinutes} min</td>
                      <td className="py-2 pr-4 text-on-surface-variant">{row.bufferMinutes} min</td>
                      <td className="py-2 pr-4 text-on-surface-variant">{row.maxAppointments ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium text-on-surface">Upcoming Exceptions</h2>
              {canWrite ? (
                <Button className="w-auto" onClick={() => setIsAddExceptionOpen(true)}>
                  + Add Exception
                </Button>
              ) : null}
            </div>
            {exceptions?.length === 0 ? <p className="text-on-surface-variant">No exceptions scheduled.</p> : null}
            {exceptions && exceptions.length > 0 ? (
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-outline/30 text-on-surface-variant">
                    <th className="py-2 pr-4 font-medium">Dates</th>
                    <th className="py-2 pr-4 font-medium">Type</th>
                    <th className="py-2 pr-4 font-medium">Hours</th>
                    <th className="py-2 pr-4 font-medium">Reason</th>
                    <th className="py-2 pr-4 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {exceptions.map((exception) => (
                    <tr key={exception.id} className="border-b border-outline/10">
                      <td className="py-2 pr-4 text-on-surface">
                        {exception.startDate}
                        {exception.endDate !== exception.startDate ? ` – ${exception.endDate}` : ""}
                      </td>
                      <td className="py-2 pr-4 text-on-surface-variant">{exception.type}</td>
                      <td className="py-2 pr-4 text-on-surface-variant">
                        {exception.startTime ? `${exception.startTime}–${exception.endTime}` : "Full day"}
                      </td>
                      <td className="py-2 pr-4 text-on-surface-variant">{exception.reason ?? "—"}</td>
                      <td className="py-2 pr-4 text-right">
                        {canWrite ? (
                          <button
                            type="button"
                            onClick={() => deleteExceptionMutation.mutate(exception.id)}
                            className="text-sm font-medium text-error hover:underline"
                          >
                            Remove
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </section>
        </>
      ) : null}

      {isEditTemplateOpen && selectedDoctorId ? (
        <EditTemplateModal
          doctorId={selectedDoctorId}
          initialDays={template ?? []}
          departmentChoices={departmentChoices}
          onClose={() => setIsEditTemplateOpen(false)}
          onSaved={() => {
            setIsEditTemplateOpen(false);
            void queryClient.invalidateQueries({ queryKey: ["schedule-template", selectedDoctorId] });
          }}
        />
      ) : null}

      {isAddExceptionOpen && selectedDoctorId ? (
        <AddExceptionModal
          doctorId={selectedDoctorId}
          onClose={() => setIsAddExceptionOpen(false)}
          onCreated={() => {
            setIsAddExceptionOpen(false);
            void queryClient.invalidateQueries({ queryKey: ["schedule-exceptions", selectedDoctorId] });
          }}
        />
      ) : null}
    </div>
  );
}

function uniqueDepartments(rows: DoctorScheduleRow[]): { id: string; name: string }[] {
  const seen = new Map<string, { id: string; name: string }>();
  for (const row of rows) {
    seen.set(row.department.id, row.department);
  }
  return [...seen.values()];
}

function EditTemplateModal({
  doctorId,
  initialDays,
  departmentChoices,
  onClose,
  onSaved,
}: {
  doctorId: string;
  initialDays: DoctorScheduleRow[];
  departmentChoices: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { accessToken } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ReplaceDoctorScheduleInput>({
    resolver: zodResolver(replaceDoctorScheduleSchema),
    defaultValues: {
      days: initialDays.map((row) => ({
        departmentId: row.departmentId,
        dayOfWeek: row.dayOfWeek,
        startTime: row.startTime,
        endTime: row.endTime,
        slotDurationMinutes: row.slotDurationMinutes,
        bufferMinutes: row.bufferMinutes,
        maxAppointments: row.maxAppointments ?? undefined,
      })),
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "days" });

  const mutation = useMutation({
    mutationFn: (input: ReplaceDoctorScheduleInput) => schedulesApi.replaceTemplate(accessToken!, doctorId, input),
    onSuccess: onSaved,
    onError: (error) => setFormError(error instanceof ApiError ? error.message : "Something went wrong."),
  });

  return (
    <Modal title="Edit Weekly Template" onClose={onClose}>
      <form onSubmit={handleSubmit((input) => mutation.mutate(input))} className="flex flex-col gap-4" noValidate>
        {formError ? <FormAlert variant="error">{formError}</FormAlert> : null}
        {errors.days?.message ? <FormAlert variant="error">{errors.days.message}</FormAlert> : null}
        {departmentChoices.length === 0 ? (
          <FormAlert variant="error">
            This doctor has no known department assignment yet — ask an Admin to add a department before setting a schedule.
          </FormAlert>
        ) : null}

        <div className="flex flex-col gap-4">
          {fields.map((field, index) => (
            <div key={field.id} className="flex flex-wrap items-end gap-2 rounded border border-outline/20 p-3">
              <SelectField label="Day" {...register(`days.${index}.dayOfWeek`, { valueAsNumber: true })}>
                {DAY_LABELS.map((label, day) => (
                  <option key={day} value={day}>
                    {label}
                  </option>
                ))}
              </SelectField>
              <SelectField label="Department" {...register(`days.${index}.departmentId`)}>
                {departmentChoices.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </SelectField>
              <TextField
                label="Start"
                type="time"
                error={errors.days?.[index]?.startTime?.message}
                {...register(`days.${index}.startTime`)}
              />
              <TextField label="End" type="time" error={errors.days?.[index]?.endTime?.message} {...register(`days.${index}.endTime`)} />
              <TextField
                label="Slot (min)"
                type="number"
                className="w-24"
                error={errors.days?.[index]?.slotDurationMinutes?.message}
                {...register(`days.${index}.slotDurationMinutes`, { valueAsNumber: true })}
              />
              <TextField
                label="Buffer (min)"
                type="number"
                className="w-24"
                {...register(`days.${index}.bufferMinutes`, { setValueAs: (v) => (v === "" ? 0 : Number(v)) })}
              />
              <TextField
                label="Max/day (optional)"
                type="number"
                className="w-24"
                {...register(`days.${index}.maxAppointments`, { setValueAs: (v) => (v === "" ? undefined : Number(v)) })}
              />
              <button type="button" onClick={() => remove(index)} className="h-11 text-sm font-medium text-error hover:underline">
                Remove
              </button>
            </div>
          ))}
        </div>

        <Button
          type="button"
          variant="secondary"
          className="w-auto"
          disabled={departmentChoices.length === 0}
          onClick={() =>
            append({
              departmentId: departmentChoices[0]?.id ?? "",
              dayOfWeek: 1,
              startTime: "09:00",
              endTime: "17:00",
              slotDurationMinutes: 20,
              bufferMinutes: 0,
            })
          }
        >
          + Add Block
        </Button>

        <Button type="submit" loading={isSubmitting || mutation.isPending}>
          Save Template
        </Button>
      </form>
    </Modal>
  );
}

function AddExceptionModal({ doctorId, onClose, onCreated }: { doctorId: string; onClose: () => void; onCreated: () => void }) {
  const { accessToken } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateScheduleExceptionInput>({
    resolver: zodResolver(createScheduleExceptionSchema),
    defaultValues: { type: "LEAVE" },
  });
  const type = watch("type");

  const mutation = useMutation({
    mutationFn: (input: CreateScheduleExceptionInput) => schedulesApi.createException(accessToken!, doctorId, input),
    onSuccess: onCreated,
    onError: (error) => setFormError(error instanceof ApiError ? error.message : "Something went wrong."),
  });

  const needsTime = type === "REDUCED_HOURS" || type === "EXTENDED_HOURS";

  return (
    <Modal title="Add Schedule Exception" onClose={onClose}>
      <form onSubmit={handleSubmit((input) => mutation.mutate(input))} className="flex flex-col gap-4" noValidate>
        {formError ? <FormAlert variant="error">{formError}</FormAlert> : null}
        <SelectField label="Type" error={errors.type?.message} {...register("type")}>
          <option value="LEAVE">Leave</option>
          <option value="HOLIDAY">Holiday</option>
          <option value="EXTENDED_HOURS">Extended Hours</option>
          <option value="REDUCED_HOURS">Reduced Hours</option>
        </SelectField>
        <TextField label="Start date" type="date" error={errors.startDate?.message} {...register("startDate")} />
        <TextField label="End date" type="date" error={errors.endDate?.message} {...register("endDate")} />
        {type !== "HOLIDAY" ? (
          <>
            <TextField
              label={needsTime ? "Start time" : "Start time (optional — blank = full day)"}
              type="time"
              error={errors.startTime?.message}
              {...register("startTime", { setValueAs: (v) => (v === "" ? undefined : v) })}
            />
            <TextField
              label={needsTime ? "End time" : "End time (optional — blank = full day)"}
              type="time"
              error={errors.endTime?.message}
              {...register("endTime", { setValueAs: (v) => (v === "" ? undefined : v) })}
            />
          </>
        ) : null}
        <TextField label="Reason (optional)" error={errors.reason?.message} {...register("reason")} />
        <Button type="submit" loading={isSubmitting || mutation.isPending}>
          Save Exception
        </Button>
      </form>
    </Modal>
  );
}
