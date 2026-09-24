import type { CancelAppointmentInput, CreateAppointmentInput, MarkNoShowInput, RescheduleAppointmentInput } from "@hospital/validation";
import { apiFetch } from "./api-client";

export interface DoctorDepartment {
  departmentId: string;
  isPrimary: boolean;
  department: { id: string; name: string; branchId: string };
}

export interface DoctorSummary {
  id: string;
  hospitalId: string;
  qualifications: string;
  bio: string | null;
  yearsOfExperience: number | null;
  consultationFee: string | null;
  photoUrl: string | null;
  status: "ACTIVE" | "INACTIVE" | "ON_LEAVE";
  user: { id: string; name: string };
  doctorDepartments: DoctorDepartment[];
}

export interface DepartmentSummary {
  id: string;
  hospitalId: string;
  branchId: string;
  name: string;
  description: string | null;
  status: "ACTIVE" | "INACTIVE";
  doctorDepartments: unknown[];
}

export interface AvailabilitySlot {
  startTime: string;
  endTime: string;
}

export interface AvailabilityResult {
  doctorId: string;
  days: { date: string; hasSlots: boolean; slots: AvailabilitySlot[] }[];
}

export type AppointmentStatus = "SCHEDULED" | "CONFIRMED" | "CHECKED_IN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "NO_SHOW";

export interface AppointmentRow {
  id: string;
  hospitalId: string;
  branchId: string;
  departmentId: string;
  doctorId: string;
  patientId: string;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
  reason: string | null;
  queueNumber: number | null;
  checkedInAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  rescheduleCount: number;
  doctor: { id: string; user: { id: string; name: string } };
  patient: { id: string; user: { id: string; name: string } };
  department?: { id: string; name: string };
  branch?: { id: string; name: string };
}

export interface AppointmentHistoryRow {
  id: string;
  action: "CREATED" | "RESCHEDULED" | "CANCELLED" | "CHECKED_IN" | "COMPLETED" | "NO_SHOW";
  previousStartTime: string | null;
  newStartTime: string | null;
  reason: string | null;
  performedAt: string;
}

export interface AppointmentDetail extends AppointmentRow {
  history: AppointmentHistoryRow[];
}

function buildQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value);
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export const doctorsApi = {
  search: (accessToken: string, filters: { query?: string; departmentId?: string }) =>
    apiFetch<DoctorSummary[]>(`/doctors${buildQuery(filters)}`, { accessToken }),
  getById: (accessToken: string, id: string) => apiFetch<DoctorSummary>(`/doctors/${id}`, { accessToken }),
};

export const departmentsApi = {
  search: (accessToken: string, filters: { query?: string }) => apiFetch<DepartmentSummary[]>(`/departments${buildQuery(filters)}`, { accessToken }),
  getById: (accessToken: string, id: string) => apiFetch<DepartmentSummary>(`/departments/${id}`, { accessToken }),
};

export const schedulesApi = {
  getAvailability: (accessToken: string, doctorId: string, from: string, to: string, departmentId?: string) =>
    apiFetch<AvailabilityResult>(`/schedules/availability${buildQuery({ doctorId, from, to, departmentId })}`, { accessToken }),
};

export const appointmentsApi = {
  list: (accessToken: string, filters: { status?: AppointmentStatus; from?: string; to?: string } = {}) =>
    apiFetch<AppointmentRow[]>(`/appointments${buildQuery(filters)}`, { accessToken }),
  getById: (accessToken: string, id: string) => apiFetch<AppointmentDetail>(`/appointments/${id}`, { accessToken }),
  create: (accessToken: string, input: CreateAppointmentInput) => apiFetch<AppointmentRow>("/appointments", { method: "POST", body: input, accessToken }),
  reschedule: (accessToken: string, id: string, input: RescheduleAppointmentInput) =>
    apiFetch<AppointmentRow>(`/appointments/${id}/reschedule`, { method: "PATCH", body: input, accessToken }),
  cancel: (accessToken: string, id: string, input: CancelAppointmentInput) =>
    apiFetch<AppointmentRow>(`/appointments/${id}/cancel`, { method: "PATCH", body: input, accessToken }),
  checkin: (accessToken: string, id: string) => apiFetch<AppointmentRow>(`/appointments/${id}/checkin`, { method: "POST", accessToken }),
  markNoShow: (accessToken: string, id: string, input: MarkNoShowInput) =>
    apiFetch<AppointmentRow>(`/appointments/${id}/no-show`, { method: "PATCH", body: input, accessToken }),
};
