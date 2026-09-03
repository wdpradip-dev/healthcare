import type {
  AssignDoctorDepartmentInput,
  CreateBranchInput,
  CreateDepartmentInput,
  CreateDoctorInput,
  InviteUserInput,
  RegisterPatientInput,
  UpdateBranchInput,
  UpdateDepartmentInput,
  UpdateDoctorInput,
  UpdatePatientInput,
  UpdateStaffInput,
  UpdateUserInput,
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
