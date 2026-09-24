import type {
  AssignDoctorDepartmentInput,
  CancelAppointmentInput,
  CreateAllergyInput,
  CreateAppointmentInput,
  CreateBranchInput,
  CreateConditionInput,
  CreateDepartmentInput,
  CreateDoctorInput,
  CreateScheduleExceptionInput,
  InviteUserInput,
  ListAppointmentsQuery,
  MarkNoShowInput,
  RegisterPatientInput,
  ReplaceDoctorScheduleInput,
  RescheduleAppointmentInput,
  UpdateBranchInput,
  UpdateConsultationInput,
  UpdateDepartmentInput,
  UpdateDoctorInput,
  UpdatePatientInput,
  UpdateStaffInput,
  UpdateUserInput,
  VitalsInput,
} from "@hospital/validation";
import { apiFetch } from "./api-client";

export interface Hospital {
  id: string;
  name: string;
  slug: string;
  contactEmail: string;
  contactPhone: string;
  status: "ACTIVE" | "SUSPENDED";
}

export interface Branch {
  id: string;
  hospitalId: string;
  name: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  contactPhone: string;
  status: "ACTIVE" | "INACTIVE";
}

export interface Department {
  id: string;
  hospitalId: string;
  branchId: string;
  name: string;
  description: string | null;
  status: "ACTIVE" | "INACTIVE";
  doctorDepartments: unknown[];
}

export interface AdminUser {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: "PENDING_ACTIVATION" | "ACTIVE" | "LOCKED" | "DISABLED";
  userRoles: { role: { key: string } }[];
  staff: { branchId: string | null; jobTitle: string | null } | null;
}

export interface Doctor {
  id: string;
  hospitalId: string;
  userId: string;
  qualifications: string;
  bio: string | null;
  yearsOfExperience: number | null;
  consultationFee: string | null;
  defaultConsultationDurationMinutes: number;
  photoUrl: string | null;
  status: "ACTIVE" | "INACTIVE" | "ON_LEAVE";
  user: { id: string; name: string; email: string | null; phone: string | null };
  doctorDepartments: { departmentId: string; isPrimary: boolean; department: { id: string; name: string } }[];
}

export interface StaffMember {
  id: string;
  hospitalId: string;
  userId: string;
  branchId: string | null;
  jobTitle: string | null;
  status: "ACTIVE" | "INACTIVE";
  user: { id: string; name: string; email: string | null; phone: string | null };
  branch: { id: string; name: string } | null;
}

export interface Patient {
  id: string;
  userId: string;
  dateOfBirth: string | null;
  gender: "MALE" | "FEMALE" | "OTHER" | "UNSPECIFIED" | null;
  bloodGroup: string | null;
  addressLine1: string | null;
  city: string | null;
  registeredHospitalId: string | null;
  registeredBranchId: string | null;
  user: { id: string; name: string; email: string | null; phone: string | null; status: string };
  registeredHospital: { id: string; name: string } | null;
  registeredBranch: { id: string; name: string } | null;
}

// hospitalId is appended to every call for a Super Admin (their own token
// carries no implicit hospital) and silently ignored server-side for an
// Admin, whose own JWT-embedded hospitalId always wins — see
// apps/api/src/common/tenant-scope.util.ts.
function withHospitalQuery(path: string, hospitalId: string | null): string {
  return hospitalId ? `${path}${path.includes("?") ? "&" : "?"}hospitalId=${hospitalId}` : path;
}

export const hospitalsApi = {
  list: (accessToken: string) => apiFetch<Hospital[]>("/hospitals", { accessToken }),
};

export const branchesApi = {
  list: (accessToken: string, hospitalId: string | null) =>
    apiFetch<Branch[]>(withHospitalQuery("/branches", hospitalId), { accessToken }),
  create: (accessToken: string, input: CreateBranchInput) =>
    apiFetch<Branch>("/branches", { method: "POST", body: input, accessToken }),
  update: (accessToken: string, id: string, input: UpdateBranchInput) =>
    apiFetch<Branch>(`/branches/${id}`, { method: "PATCH", body: input, accessToken }),
};

export const departmentsApi = {
  list: (accessToken: string, hospitalId: string | null, branchId?: string) =>
    apiFetch<Department[]>(withHospitalQuery(`/departments${branchId ? `?branchId=${branchId}` : ""}`, hospitalId), {
      accessToken,
    }),
  create: (accessToken: string, input: CreateDepartmentInput) =>
    apiFetch<Department>("/departments", { method: "POST", body: input, accessToken }),
  update: (accessToken: string, id: string, input: UpdateDepartmentInput) =>
    apiFetch<Department>(`/departments/${id}`, { method: "PATCH", body: input, accessToken }),
};

export const usersApi = {
  list: (accessToken: string, hospitalId: string | null, filters?: { role?: string; status?: string }) =>
    apiFetch<AdminUser[]>(
      withHospitalQuery(
        `/users${filters?.role ? `?role=${filters.role}` : ""}${filters?.status ? `${filters?.role ? "&" : "?"}status=${filters.status}` : ""}`,
        hospitalId,
      ),
      { accessToken },
    ),
  invite: (accessToken: string, input: InviteUserInput) =>
    apiFetch<{ userId: string; status: string; roleKey: string }>("/users/invite", {
      method: "POST",
      body: input,
      accessToken,
    }),
  update: (accessToken: string, id: string, input: UpdateUserInput) =>
    apiFetch<AdminUser>(`/users/${id}`, { method: "PATCH", body: input, accessToken }),
  deactivate: (accessToken: string, id: string) =>
    apiFetch<AdminUser>(`/users/${id}/deactivate`, { method: "POST", accessToken }),
};

export const doctorsApi = {
  list: (accessToken: string, hospitalId: string | null) =>
    apiFetch<Doctor[]>(withHospitalQuery("/doctors", hospitalId), { accessToken }),
  create: (accessToken: string, input: CreateDoctorInput) =>
    apiFetch<Doctor>("/doctors", { method: "POST", body: input, accessToken }),
  update: (accessToken: string, id: string, input: UpdateDoctorInput) =>
    apiFetch<Doctor>(`/doctors/${id}`, { method: "PATCH", body: input, accessToken }),
  assignDepartment: (accessToken: string, id: string, input: AssignDoctorDepartmentInput) =>
    apiFetch<Doctor>(`/doctors/${id}/departments`, { method: "POST", body: input, accessToken }),
  removeDepartment: (accessToken: string, id: string, departmentId: string) =>
    apiFetch<Doctor>(`/doctors/${id}/departments/${departmentId}`, { method: "DELETE", accessToken }),
};

export const staffApi = {
  list: (accessToken: string, hospitalId: string | null) =>
    apiFetch<StaffMember[]>(withHospitalQuery("/staff", hospitalId), { accessToken }),
  update: (accessToken: string, id: string, input: UpdateStaffInput) =>
    apiFetch<StaffMember>(`/staff/${id}`, { method: "PATCH", body: input, accessToken }),
  deactivate: (accessToken: string, id: string) =>
    apiFetch<StaffMember>(`/staff/${id}/deactivate`, { method: "POST", accessToken }),
};

export const patientsApi = {
  list: (accessToken: string, hospitalId: string | null) =>
    apiFetch<Patient[]>(withHospitalQuery("/patients", hospitalId), { accessToken }),
  register: (accessToken: string, input: RegisterPatientInput) =>
    apiFetch<{ id: string; userId: string; status: string }>("/patients", { method: "POST", body: input, accessToken }),
  update: (accessToken: string, id: string, input: UpdatePatientInput) =>
    apiFetch<Patient>(`/patients/${id}`, { method: "PATCH", body: input, accessToken }),
};

export interface DoctorScheduleRow {
  id: string;
  doctorId: string;
  departmentId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
  bufferMinutes: number;
  maxAppointments: number | null;
  department: { id: string; name: string };
}

export interface ScheduleExceptionRow {
  id: string;
  doctorId: string | null;
  type: "LEAVE" | "HOLIDAY" | "EXTENDED_HOURS" | "REDUCED_HOURS";
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
}

export interface AvailabilityResult {
  doctorId: string;
  days: { date: string; hasSlots: boolean; slots: { startTime: string; endTime: string }[] }[];
}

export interface AppointmentDoctor {
  id: string;
  userId: string;
  user: { id: string; name: string };
}

export interface AppointmentPatient {
  id: string;
  userId: string;
  user: { id: string; name: string; email: string | null; phone: string | null };
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
  isLateCancellation: boolean;
  doctor: AppointmentDoctor;
  patient: AppointmentPatient;
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
  performedBy: string;
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

export const appointmentsApi = {
  list: (accessToken: string, hospitalId: string | null, filters: Partial<ListAppointmentsQuery> = {}) =>
    apiFetch<AppointmentRow[]>(
      withHospitalQuery(
        `/appointments${buildQuery({
          status: filters.status,
          doctorId: filters.doctorId,
          patientId: filters.patientId,
          branchId: filters.branchId,
          departmentId: filters.departmentId,
          from: filters.from,
          to: filters.to,
          view: filters.view,
        })}`,
        hospitalId,
      ),
      { accessToken },
    ),
  getById: (accessToken: string, id: string) => apiFetch<AppointmentDetail>(`/appointments/${id}`, { accessToken }),
  create: (accessToken: string, input: CreateAppointmentInput) =>
    apiFetch<AppointmentRow>("/appointments", { method: "POST", body: input, accessToken }),
  reschedule: (accessToken: string, id: string, input: RescheduleAppointmentInput) =>
    apiFetch<AppointmentRow>(`/appointments/${id}/reschedule`, { method: "PATCH", body: input, accessToken }),
  cancel: (accessToken: string, id: string, input: CancelAppointmentInput) =>
    apiFetch<AppointmentRow>(`/appointments/${id}/cancel`, { method: "PATCH", body: input, accessToken }),
  checkin: (accessToken: string, id: string) => apiFetch<AppointmentRow>(`/appointments/${id}/checkin`, { method: "POST", accessToken }),
  markNoShow: (accessToken: string, id: string, input: MarkNoShowInput) =>
    apiFetch<AppointmentRow>(`/appointments/${id}/no-show`, { method: "PATCH", body: input, accessToken }),
};

export const schedulesApi = {
  getTemplate: (accessToken: string, doctorId: string) =>
    apiFetch<DoctorScheduleRow[]>(`/schedules/${doctorId}`, { accessToken }),
  replaceTemplate: (accessToken: string, doctorId: string, input: ReplaceDoctorScheduleInput) =>
    apiFetch<DoctorScheduleRow[]>(`/schedules/${doctorId}`, { method: "PUT", body: input, accessToken }),
  listExceptions: (accessToken: string, doctorId: string) =>
    apiFetch<ScheduleExceptionRow[]>(`/schedules/${doctorId}/exceptions`, { accessToken }),
  createException: (accessToken: string, doctorId: string, input: CreateScheduleExceptionInput) =>
    apiFetch<ScheduleExceptionRow>(`/schedules/${doctorId}/exceptions`, { method: "POST", body: input, accessToken }),
  deleteException: (accessToken: string, doctorId: string, exceptionId: string) =>
    apiFetch<{ success: true }>(`/schedules/${doctorId}/exceptions/${exceptionId}`, { method: "DELETE", accessToken }),
  getAvailability: (accessToken: string, doctorId: string, from: string, to: string, departmentId?: string) =>
    apiFetch<AvailabilityResult>(
      `/schedules/availability?doctorId=${doctorId}&from=${from}&to=${to}${departmentId ? `&departmentId=${departmentId}` : ""}`,
      { accessToken },
    ),
};

export interface ClinicalNoteRow {
  id: string;
  authorId: string;
  content: string;
  isInternal: boolean;
  createdAt: string;
}

export interface DiagnosisRow {
  id: string;
  icd10Code: string | null;
  description: string;
}

export interface VitalRow {
  id: string;
  bloodPressureSystolic: number | null;
  bloodPressureDiastolic: number | null;
  heartRate: number | null;
  temperatureCelsius: string | null;
  weightKg: string | null;
  heightCm: string | null;
  spo2: number | null;
  recordedBy: string;
  recordedAt: string;
}

export interface ConsultationDetail {
  id: string;
  appointmentId: string;
  hospitalId: string;
  status: "IN_PROGRESS" | "COMPLETED";
  startedAt: string | null;
  completedAt: string | null;
  doctor: { id: string; userId: string; user: { id: string; name: string } };
  patient: { id: string; userId: string; user: { id: string; name: string } };
  appointment: { id: string; startTime: string; department: { id: string; name: string } };
  clinicalNotes: ClinicalNoteRow[];
  diagnoses: DiagnosisRow[];
  vitals: VitalRow[];
}

export const consultationsApi = {
  getById: (accessToken: string, id: string) => apiFetch<ConsultationDetail>(`/consultations/${id}`, { accessToken }),
  start: (accessToken: string, appointmentId: string) =>
    apiFetch<ConsultationDetail>("/consultations", { method: "POST", body: { appointmentId }, accessToken }),
  update: (accessToken: string, id: string, input: UpdateConsultationInput) =>
    apiFetch<ConsultationDetail>(`/consultations/${id}`, { method: "PATCH", body: input, accessToken }),
  updateVitals: (accessToken: string, id: string, input: VitalsInput) =>
    apiFetch<ConsultationDetail>(`/consultations/${id}/vitals`, { method: "PATCH", body: input, accessToken }),
  complete: (accessToken: string, id: string) =>
    apiFetch<ConsultationDetail>(`/consultations/${id}/complete`, { method: "POST", accessToken }),
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
  diagnosedDate: string | null;
  notes: string | null;
}

export interface AllergyRow {
  id: string;
  allergen: string;
  reaction: string | null;
  severity: "MILD" | "MODERATE" | "SEVERE";
}

export const medicalRecordsApi = {
  list: (accessToken: string, patientId: string) => apiFetch<MedicalRecordEntry[]>(`/medical-records?patientId=${patientId}`, { accessToken }),
  conditions: (accessToken: string, patientId: string) =>
    apiFetch<MedicalConditionRow[]>(`/medical-records/conditions?patientId=${patientId}`, { accessToken }),
  allergies: (accessToken: string, patientId: string) => apiFetch<AllergyRow[]>(`/medical-records/allergies?patientId=${patientId}`, { accessToken }),
  createCondition: (accessToken: string, input: CreateConditionInput) =>
    apiFetch<MedicalConditionRow>("/medical-records/conditions", { method: "POST", body: input, accessToken }),
  createAllergy: (accessToken: string, input: CreateAllergyInput) =>
    apiFetch<AllergyRow>("/medical-records/allergies", { method: "POST", body: input, accessToken }),
};
