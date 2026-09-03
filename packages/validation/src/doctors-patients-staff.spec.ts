import { assignDoctorDepartmentSchema, createDoctorSchema, updateDoctorSchema } from "./doctors";
import { registerPatientSchema, updatePatientSchema } from "./patients";
import { updateStaffSchema } from "./staff";

describe("createDoctorSchema", () => {
  const valid = { userId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", qualifications: "MBBS, MD" };

  it("accepts hospitalId omitted (Admin's own hospital fills in server-side)", () => {
    expect(createDoctorSchema.safeParse(valid).success).toBe(true);
  });

  it("requires qualifications", () => {
    expect(createDoctorSchema.safeParse({ userId: valid.userId, qualifications: "" }).success).toBe(false);
  });

  it("requires a valid userId uuid", () => {
    expect(createDoctorSchema.safeParse({ ...valid, userId: "not-a-uuid" }).success).toBe(false);
  });

  it("rejects a negative yearsOfExperience", () => {
    expect(createDoctorSchema.safeParse({ ...valid, yearsOfExperience: -1 }).success).toBe(false);
  });

  it("accepts an optional departmentIds array", () => {
    expect(createDoctorSchema.safeParse({ ...valid, departmentIds: ["3fa85f64-5717-4562-b3fc-2c963f66afa6"] }).success).toBe(true);
  });
});

describe("updateDoctorSchema", () => {
  it("omits hospitalId/userId/departmentIds (immutable via this route)", () => {
    expect(Object.keys(updateDoctorSchema.shape)).not.toEqual(expect.arrayContaining(["hospitalId", "userId", "departmentIds"]));
  });

  it("accepts a status transition", () => {
    expect(updateDoctorSchema.safeParse({ status: "ON_LEAVE" }).success).toBe(true);
  });

  it("rejects an unknown status", () => {
    expect(updateDoctorSchema.safeParse({ status: "RETIRED" }).success).toBe(false);
  });
});

describe("assignDoctorDepartmentSchema", () => {
  it("requires a valid departmentId uuid", () => {
    expect(assignDoctorDepartmentSchema.safeParse({ departmentId: "not-a-uuid" }).success).toBe(false);
  });

  it("accepts an optional isPrimary flag", () => {
    expect(
      assignDoctorDepartmentSchema.safeParse({ departmentId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", isPrimary: true }).success,
    ).toBe(true);
  });
});

describe("registerPatientSchema", () => {
  const base = { name: "Alice Kumar" };

  it("requires at least one of email or phone", () => {
    expect(registerPatientSchema.safeParse(base).success).toBe(false);
  });

  it("accepts email only", () => {
    expect(registerPatientSchema.safeParse({ ...base, email: "alice@example.test" }).success).toBe(true);
  });

  it("accepts phone only", () => {
    expect(registerPatientSchema.safeParse({ ...base, phone: "+15551234567" }).success).toBe(true);
  });

  it("rejects an invalid gender", () => {
    expect(registerPatientSchema.safeParse({ ...base, email: "a@b.com", gender: "NONBINARY" }).success).toBe(false);
  });

  it("accepts a valid dateOfBirth (YYYY-MM-DD)", () => {
    expect(registerPatientSchema.safeParse({ ...base, email: "a@b.com", dateOfBirth: "1990-05-15" }).success).toBe(true);
  });

  it("rejects a malformed dateOfBirth", () => {
    expect(registerPatientSchema.safeParse({ ...base, email: "a@b.com", dateOfBirth: "15/05/1990" }).success).toBe(false);
  });
});

describe("updatePatientSchema", () => {
  it("has no hospitalId/branchId fields (registration scope is immutable)", () => {
    expect(Object.keys(updatePatientSchema.shape)).not.toEqual(expect.arrayContaining(["hospitalId", "branchId"]));
  });

  it("accepts a partial demographic update", () => {
    expect(updatePatientSchema.safeParse({ bloodGroup: "O+" }).success).toBe(true);
  });

  it("accepts an empty object (no-op update)", () => {
    expect(updatePatientSchema.safeParse({}).success).toBe(true);
  });
});

describe("updateStaffSchema", () => {
  it("accepts a partial update", () => {
    expect(updateStaffSchema.safeParse({ jobTitle: "Senior Nurse" }).success).toBe(true);
  });

  it("accepts a null branchId (unassign)", () => {
    expect(updateStaffSchema.safeParse({ branchId: null }).success).toBe(true);
  });

  it("rejects an unknown status", () => {
    expect(updateStaffSchema.safeParse({ status: "PENDING_ACTIVATION" }).success).toBe(false);
  });
});
