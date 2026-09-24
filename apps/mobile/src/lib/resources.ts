import type { CancelAppointmentInput, CreateAppointmentInput, MarkNoShowInput, RescheduleAppointmentInput } from "@hospital/validation";
import { apiFetch, apiUpload } from "./api-client";

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
  consultation: { id: string; status: "IN_PROGRESS" | "COMPLETED" } | null;
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

export interface MedicalRecordEntry {
  type: "CONSULTATION";
  id: string;
  date: string | null;
  hospitalId: string;
  status: "IN_PROGRESS" | "COMPLETED";
  doctor: { id: string; name: string };
  department: string | null;
  diagnoses: { icd10Code: string | null; description: string }[];
}

export interface MedicalConditionRow {
  id: string;
  name: string;
  status: "ACTIVE" | "RESOLVED" | "CHRONIC";
}

export interface AllergyRow {
  id: string;
  allergen: string;
  reaction: string | null;
  severity: "MILD" | "MODERATE" | "SEVERE";
}

export interface MedicalRecordsSummary {
  patientId: string;
  activeConditions: MedicalConditionRow[];
  allergies: AllergyRow[];
  consultationCount: number;
  recentConsultations: MedicalRecordEntry[];
  activePrescriptionCount: number;
}

export interface ConsultationDetail {
  id: string;
  status: "IN_PROGRESS" | "COMPLETED";
  startedAt: string | null;
  doctor: { id: string; user: { id: string; name: string } };
  appointment: { id: string; startTime: string; department: { id: string; name: string } };
  clinicalNotes: { id: string; content: string }[];
  diagnoses: { id: string; icd10Code: string | null; description: string }[];
  vitals: {
    id: string;
    bloodPressureSystolic: number | null;
    bloodPressureDiastolic: number | null;
    heartRate: number | null;
    temperatureCelsius: string | null;
    weightKg: string | null;
    spo2: number | null;
  }[];
}

export const medicalRecordsApi = {
  summary: (accessToken: string) => apiFetch<MedicalRecordsSummary>("/medical-records/summary", { accessToken }),
  list: (accessToken: string) => apiFetch<MedicalRecordEntry[]>("/medical-records", { accessToken }),
};

export const consultationsApi = {
  getById: (accessToken: string, id: string) => apiFetch<ConsultationDetail>(`/consultations/${id}`, { accessToken }),
};

export interface PrescriptionRow {
  id: string;
  status: "ACTIVE" | "SUPERSEDED" | "EXPIRED";
  issuedAt: string;
  doctor: { id: string; user: { name: string } };
  items: {
    id: string;
    freeTextName: string | null;
    dosage: string;
    frequency: string;
    durationDays: number | null;
    instructions: string | null;
    medication: { id: string; name: string; strength: string | null } | null;
  }[];
}

export const prescriptionsApi = {
  list: (accessToken: string) => apiFetch<PrescriptionRow[]>("/prescriptions", { accessToken }),
  getById: (accessToken: string, id: string) => apiFetch<PrescriptionRow>(`/prescriptions/${id}`, { accessToken }),
  pdfUrl: (accessToken: string, id: string) => apiFetch<{ url: string }>(`/prescriptions/${id}/pdf`, { accessToken }),
};

/** The AI text and its provenance are one object — never render `text` without the label (docs/27). */
export interface AiSummary {
  text: string;
  aiGenerated: true;
  reviewedBy: string | null;
}

export interface ReportRow {
  id: string;
  type: "lab" | "imaging";
  title: string;
  structuredValues: Record<string, { value: string | number; unit?: string; referenceRange?: string; flag?: string }> | null;
  findings: string | null;
  aiSummary: AiSummary | null;
  verifiedByName: string | null;
  releasedAt: string | null;
}

export const reportsApi = {
  list: (accessToken: string) => apiFetch<ReportRow[]>("/reports", { accessToken }),
  getById: (accessToken: string, id: string) => apiFetch<ReportRow>(`/reports/${id}`, { accessToken }),
  fileUrl: (accessToken: string, id: string) => apiFetch<{ url: string }>(`/reports/${id}/file`, { accessToken }),
};

export interface DocumentRow {
  id: string;
  category: "REPORT_ATTACHMENT" | "PRESCRIPTION_PDF" | "ID_PROOF" | "INSURANCE" | "OTHER";
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export const documentsApi = {
  list: (accessToken: string) => apiFetch<DocumentRow[]>("/documents", { accessToken }),
  upload: (accessToken: string, form: FormData) => apiUpload<DocumentRow>("/documents", form, accessToken),
  downloadUrl: (accessToken: string, id: string) => apiFetch<{ url: string }>(`/documents/${id}/download`, { accessToken }),
};
