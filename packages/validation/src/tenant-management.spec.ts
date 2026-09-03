import { createHospitalSchema } from "./hospitals";
import { createBranchSchema, operatingHoursSchema } from "./branches";
import { createDepartmentSchema } from "./departments";
import { activateUserSchema, inviteUserSchema } from "./users";

describe("createHospitalSchema", () => {
  const valid = { name: "City General", slug: "city-general", contactEmail: "a@b.com", contactPhone: "+15551234567" };

  it("accepts a valid hospital", () => {
    expect(createHospitalSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an uppercase or spaced slug", () => {
    expect(createHospitalSchema.safeParse({ ...valid, slug: "City General" }).success).toBe(false);
    expect(createHospitalSchema.safeParse({ ...valid, slug: "city_general" }).success).toBe(false);
  });

  it("rejects a malformed primaryColor", () => {
    expect(createHospitalSchema.safeParse({ ...valid, primaryColor: "teal" }).success).toBe(false);
    expect(createHospitalSchema.safeParse({ ...valid, primaryColor: "#0F6E63" }).success).toBe(true);
  });
});

describe("operatingHoursSchema", () => {
  it("accepts a partial week with HH:MM times", () => {
    expect(operatingHoursSchema.safeParse({ monday: { open: "08:00", close: "20:00" } }).success).toBe(true);
  });

  it("rejects an unknown day key (strict)", () => {
    expect(operatingHoursSchema.safeParse({ someday: { open: "08:00", close: "20:00" } }).success).toBe(false);
  });

  it("rejects a non-24h time format", () => {
    expect(operatingHoursSchema.safeParse({ monday: { open: "8am", close: "8pm" } }).success).toBe(false);
  });
});

describe("createBranchSchema", () => {
  const valid = {
    name: "Main",
    address: "1 Main St",
    city: "Springfield",
    state: "IL",
    postalCode: "62701",
    country: "USA",
    contactPhone: "+15551234567",
    operatingHours: {},
  };

  it("accepts hospitalId omitted (Admin's own hospital fills in server-side)", () => {
    expect(createBranchSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts an explicit hospitalId (Super Admin)", () => {
    expect(createBranchSchema.safeParse({ ...valid, hospitalId: "3fa85f64-5717-4562-b3fc-2c963f66afa6" }).success).toBe(true);
  });

  it("rejects out-of-range latitude/longitude", () => {
    expect(createBranchSchema.safeParse({ ...valid, latitude: 200 }).success).toBe(false);
  });
});

describe("createDepartmentSchema", () => {
  it("requires a valid branchId uuid", () => {
    const result = createDepartmentSchema.safeParse({ branchId: "not-a-uuid", name: "Cardiology" });
    expect(result.success).toBe(false);
  });

  it("accepts a valid department", () => {
    const result = createDepartmentSchema.safeParse({
      branchId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      name: "Cardiology",
    });
    expect(result.success).toBe(true);
  });
});

describe("inviteUserSchema", () => {
  it("rejects a roleKey outside the invitable set (e.g. PATIENT, SUPER_ADMIN)", () => {
    const base = { name: "Jane", email: "jane@example.com" };
    expect(inviteUserSchema.safeParse({ ...base, roleKey: "PATIENT" }).success).toBe(false);
    expect(inviteUserSchema.safeParse({ ...base, roleKey: "SUPER_ADMIN" }).success).toBe(false);
    expect(inviteUserSchema.safeParse({ ...base, roleKey: "NURSE" }).success).toBe(true);
  });

  it("requires at least one of email or phone", () => {
    const result = inviteUserSchema.safeParse({ name: "Jane", roleKey: "ADMIN" });
    expect(result.success).toBe(false);
  });
});

describe("activateUserSchema", () => {
  const valid = {
    activationToken: "a.b.c",
    otpChallengeId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    code: "123456",
    password: "Password1",
  };

  it("accepts a fully valid activation payload", () => {
    expect(activateUserSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a weak password", () => {
    expect(activateUserSchema.safeParse({ ...valid, password: "weak" }).success).toBe(false);
  });
});
