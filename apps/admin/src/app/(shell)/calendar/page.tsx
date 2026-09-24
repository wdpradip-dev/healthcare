"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { appointmentStatusColor } from "@hospital/ui-tokens";
import { Button } from "@hospital/ui-web";
import { useAuth } from "@/lib/auth-provider";
import { useHospitalScope } from "@/lib/hospital-scope";
import { appointmentsApi, doctorsApi, type AppointmentRow } from "@/lib/resources";
import { AppointmentDetailsModal, STATUS_LABELS } from "@/components/appointments/appointment-details-modal";

// docs/45-DESIGN-TOKENS.md's appointmentStatusColor is the single source of
// truth for status -> color token; container/on-container Tailwind classes
// (apps/admin/tailwind.config.ts) are generated from it here so this page
// never hand-picks its own status palette. "outline" (CANCELLED) has no
// container/on-container pair in the token set, so it falls back to the
// neutral surface-variant pairing used for muted/inactive UI elsewhere.
const STATUS_COLOR: Record<AppointmentRow["status"], string> = Object.fromEntries(
  Object.entries(appointmentStatusColor).map(([status, token]) => [
    status,
    token === "outline" ? "bg-surface-variant text-on-surface-variant line-through" : `bg-${token}-container text-on-${token}-container`,
  ]),
) as Record<AppointmentRow["status"], string>;

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftDate(date: string, deltaDays: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function timeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/**
 * docs/09-ADMIN-DESIGN-MOCKUPS.md "Calendar" — a simplified day-view grid
 * (doctor columns × time-of-day rows derived from that day's actual
 * appointments). Week/Month views and drag-to-reschedule are deferred —
 * this covers the read + click-through-to-Details path (`GET
 * /appointments?view=calendar&from=&to=`), the part of the mockup that's
 * actually load-bearing for daily front-desk use.
 */
export default function CalendarPage() {
  const { accessToken } = useAuth();
  const { selectedHospitalId } = useHospitalScope();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(todayDateOnly());
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
    queryKey: ["appointments", "calendar", selectedHospitalId, date],
    queryFn: () => appointmentsApi.list(accessToken!, selectedHospitalId, { from: date, to: date, view: "calendar" }),
    enabled: Boolean(accessToken),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["appointments", "calendar"] });

  const columns = useMemo(() => {
    const doctorIdsWithAppointments = new Set((appointments ?? []).map((a) => a.doctorId));
    return (doctors ?? []).filter((d) => doctorIdsWithAppointments.has(d.id));
  }, [doctors, appointments]);

  const rows = useMemo(() => {
    const times = new Set((appointments ?? []).map((a) => a.startTime));
    return [...times].sort();
  }, [appointments]);

  const cell = (doctorId: string, startTime: string) => (appointments ?? []).find((a) => a.doctorId === doctorId && a.startTime === startTime);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-on-surface">Calendar</h1>
        <div className="flex items-center gap-2">
          <Button className="w-auto" variant="secondary" onClick={() => setDate((d) => shiftDate(d, -1))}>
            ◀
          </Button>
          <span className="text-sm font-medium text-on-surface">
            {new Date(`${date}T00:00:00.000Z`).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
          </span>
          <Button className="w-auto" variant="secondary" onClick={() => setDate((d) => shiftDate(d, 1))}>
            ▶
          </Button>
        </div>
      </div>

      {isLoading ? <p className="text-on-surface-variant">Loading…</p> : null}
      {isError ? <p className="text-error">Couldn&apos;t load the calendar. Please try again.</p> : null}
      {!isLoading && !isError && columns.length === 0 ? <p className="text-on-surface-variant">No appointments on this day.</p> : null}

      {columns.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-outline/30 text-on-surface-variant">
                <th className="py-2 pr-4 font-medium">Time</th>
                {columns.map((doctor) => (
                  <th key={doctor.id} className="py-2 pr-4 font-medium">
                    {doctor.user.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((startTime) => (
                <tr key={startTime} className="border-b border-outline/10">
                  <td className="py-2 pr-4 font-medium text-on-surface-variant">{timeOfDay(startTime)}</td>
                  {columns.map((doctor) => {
                    const appt = cell(doctor.id, startTime);
                    return (
                      <td key={doctor.id} className="py-2 pr-4">
                        {appt ? (
                          <button
                            type="button"
                            onClick={() => setSelectedAppointmentId(appt.id)}
                            className={`w-full rounded px-2 py-1 text-left text-xs font-medium ${STATUS_COLOR[appt.status]}`}
                          >
                            {appt.patient.user.name}
                            <span className="block text-[11px] opacity-80">{STATUS_LABELS[appt.status]}</span>
                          </button>
                        ) : (
                          <span className="text-on-surface-variant">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {selectedAppointmentId ? (
        <AppointmentDetailsModal appointmentId={selectedAppointmentId} onClose={() => setSelectedAppointmentId(null)} onChanged={invalidate} />
      ) : null}
    </div>
  );
}
