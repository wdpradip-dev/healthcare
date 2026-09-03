import type {
  CreateBranchInput,
  CreateDepartmentInput,
  InviteUserInput,
  UpdateBranchInput,
  UpdateDepartmentInput,
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
  list: (accessToken: string, hospitalId: string | null) =>
    apiFetch<AdminUser[]>(withHospitalQuery("/users", hospitalId), { accessToken }),
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
