"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, FormAlert, Modal, SelectField, TextField } from "@hospital/ui-web";
import { useAuth } from "@/lib/auth-provider";
import { hasPermission } from "@/lib/permissions";
import { ApiError } from "@/lib/api-client";
import { appointmentsApi, schedulesApi, type AppointmentRow, type AppointmentStatus } from "@/lib/resources";

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  SCHEDULED: "Scheduled",
  CONFIRMED: "Confirmed",
  CHECKED_IN: "Checked In",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No Show",
};

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** docs/09-ADMIN-DESIGN-MOCKUPS.md "Appointment Details" — shared between the
 * Appointments list and Calendar screens (both open the same modal on a row/
 * cell click), per the established Phase 4-6 list+modal convention (no
 * separate Details route). */
export function AppointmentDetailsModal({
  appointmentId,
  onClose,
  onChanged,
}: {
  appointmentId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { accessToken, user } = useAuth();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const role = user?.roles[0] ?? "";
  const canReschedule = hasPermission(user, "appointments.update") && role !== "DOCTOR";
  const canNoShow = hasPermission(user, "appointments.update") && role !== "PATIENT";
  const canCancel = hasPermission(user, "appointments.cancel");
  const canCheckin = hasPermission(user, "appointments.checkin");

  const {
    data: appointment,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["appointment", appointmentId],
    queryFn: () => appointmentsApi.getById(accessToken!, appointmentId),
    enabled: Boolean(accessToken),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["appointment", appointmentId] });
    onChanged();
  };
  const onActionError = (error: unknown) => setActionError(error instanceof ApiError ? error.message : "Something went wrong.");

  const cancelMutation = useMutation({
    mutationFn: () => appointmentsApi.cancel(accessToken!, appointmentId, { reason: cancelReason || undefined }),
    onSuccess: () => {
      setShowCancelConfirm(false);
      refresh();
    },
    onError: onActionError,
  });
  const checkinMutation = useMutation({
    mutationFn: () => appointmentsApi.checkin(accessToken!, appointmentId),
    onSuccess: refresh,
    onError: onActionError,
  });
  const noShowMutation = useMutation({
    mutationFn: () => appointmentsApi.markNoShow(accessToken!, appointmentId, {}),
    onSuccess: refresh,
    onError: onActionError,
  });

  const isActive = appointment && appointment.status !== "CANCELLED" && appointment.status !== "COMPLETED" && appointment.status !== "NO_SHOW";
  const canCheckinNow = isActive && (appointment!.status === "SCHEDULED" || appointment!.status === "CONFIRMED");

  return (
    <Modal title={`Appointment${appointment ? ` — ${STATUS_LABELS[appointment.status]}` : ""}`} onClose={onClose}>
      {isLoading ? <p className="text-on-surface-variant">Loading…</p> : null}
      {isError ? <FormAlert variant="error">Couldn&apos;t load this appointment.</FormAlert> : null}

      {appointment ? (
        <div className="flex flex-col gap-4">
          {actionError ? <FormAlert variant="error">{actionError}</FormAlert> : null}

          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-on-surface-variant">Patient</dt>
            <dd className="text-on-surface">{appointment.patient.user.name}</dd>
            <dt className="text-on-surface-variant">Doctor</dt>
            <dd className="text-on-surface">{appointment.doctor.user.name}</dd>
            <dt className="text-on-surface-variant">Date/Time</dt>
            <dd className="text-on-surface">{formatDateTime(appointment.startTime)}</dd>
            <dt className="text-on-surface-variant">Reason</dt>
            <dd className="text-on-surface">{appointment.reason ?? "—"}</dd>
            {appointment.queueNumber != null ? (
              <>
                <dt className="text-on-surface-variant">Queue #</dt>
                <dd className="text-on-surface">{appointment.queueNumber}</dd>
              </>
            ) : null}
            {appointment.cancelReason ? (
              <>
                <dt className="text-on-surface-variant">Cancel reason</dt>
                <dd className="text-on-surface">{appointment.cancelReason}</dd>
              </>
            ) : null}
          </dl>

          <div className="flex flex-wrap gap-2">
            {canReschedule && isActive && appointment.status !== "CHECKED_IN" && appointment.status !== "IN_PROGRESS" ? (
              <Button className="w-auto" variant="secondary" onClick={() => setIsRescheduleOpen(true)}>
                Reschedule
              </Button>
            ) : null}
            {canCancel && isActive ? (
              <Button className="w-auto" variant="secondary" onClick={() => setShowCancelConfirm(true)}>
                Cancel
              </Button>
            ) : null}
            {canCheckin && canCheckinNow ? (
              <Button className="w-auto" onClick={() => checkinMutation.mutate()} loading={checkinMutation.isPending}>
                Check In
              </Button>
            ) : null}
            {canNoShow && canCheckinNow ? (
              <Button className="w-auto" variant="secondary" onClick={() => noShowMutation.mutate()} loading={noShowMutation.isPending}>
                Mark No-Show
              </Button>
            ) : null}
          </div>

          {showCancelConfirm ? (
            <div className="flex flex-col gap-2 rounded border border-outline/20 p-3">
              <TextField label="Cancellation reason (optional)" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
              <div className="flex gap-2">
                <Button className="w-auto" onClick={() => cancelMutation.mutate()} loading={cancelMutation.isPending}>
                  Confirm Cancel
                </Button>
                <Button className="w-auto" variant="secondary" onClick={() => setShowCancelConfirm(false)}>
                  Back
                </Button>
              </div>
            </div>
          ) : null}

          <div>
            <h3 className="mb-2 text-sm font-medium text-on-surface">History</h3>
            <ul className="flex flex-col gap-1 text-sm text-on-surface-variant">
              {appointment.history.map((h) => (
                <li key={h.id}>
                  {h.action} ·{" "}
                  {new Date(h.performedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  {h.reason ? ` — ${h.reason}` : ""}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {isRescheduleOpen && appointment ? (
        <RescheduleModal
          appointment={appointment}
          onClose={() => setIsRescheduleOpen(false)}
          onRescheduled={() => {
            setIsRescheduleOpen(false);
            refresh();
          }}
        />
      ) : null}
    </Modal>
  );
}

function RescheduleModal({
  appointment,
  onClose,
  onRescheduled,
}: {
  appointment: AppointmentRow;
  onClose: () => void;
  onRescheduled: () => void;
}) {
  const { accessToken } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const [date, setDate] = useState(appointment.startTime.slice(0, 10));
  const [startTime, setStartTime] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  const { data: availability, isFetching } = useQuery({
    queryKey: ["availability", appointment.doctorId, appointment.departmentId, date],
    queryFn: () => schedulesApi.getAvailability(accessToken!, appointment.doctorId, date, date, appointment.departmentId),
    enabled: Boolean(accessToken) && Boolean(date),
  });
  const slots = useMemo(() => availability?.days[0]?.slots ?? [], [availability]);

  const mutation = useMutation({
    mutationFn: () =>
      appointmentsApi.reschedule(accessToken!, appointment.id, { newStartTime: startTime, overrideReason: overrideReason || undefined }),
    onSuccess: onRescheduled,
    onError: (error) => setFormError(error instanceof ApiError ? error.message : "Something went wrong."),
  });

  return (
    <Modal title="Reschedule Appointment" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
        className="flex flex-col gap-4"
        noValidate
      >
        {formError ? <FormAlert variant="error">{formError}</FormAlert> : null}
        <TextField
          label="New date"
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setStartTime("");
          }}
        />
        <SelectField label="New time" value={startTime} onChange={(e) => setStartTime(e.target.value)}>
          <option value="">{isFetching ? "Loading…" : slots.length === 0 ? "No open slots this day" : "Select a time…"}</option>
          {slots.map((slot) => (
            <option key={slot.startTime} value={slot.startTime}>
              {new Date(slot.startTime).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Override reason (required if rescheduling within the hospital's notice window)"
          value={overrideReason}
          onChange={(e) => setOverrideReason(e.target.value)}
        />
        <Button type="submit" loading={mutation.isPending} disabled={!startTime}>
          Confirm Reschedule
        </Button>
      </form>
    </Modal>
  );
}
