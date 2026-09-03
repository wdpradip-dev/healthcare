import { registerSchema, passwordSchema, loginSchema, verifyOtpSchema } from "./auth";

describe("passwordSchema", () => {
  it("accepts a policy-compliant password", () => {
    expect(passwordSchema.safeParse("SecurePass1").success).toBe(true);
  });

  it.each([
    ["short1A", "too short"],
    ["alllowercase1", "no uppercase"],
    ["NoDigitsHere", "no number"],
  ])("rejects %s (%s)", (value) => {
    expect(passwordSchema.safeParse(value).success).toBe(false);
  });
});

describe("registerSchema", () => {
  const base = {
    name: "Alice Kumar",
    password: "SecurePass1",
    acceptedTerms: true as const,
  };

  it("accepts a valid registration with email only", () => {
    expect(registerSchema.safeParse({ ...base, email: "alice@example.com" }).success).toBe(true);
  });

  it("accepts a valid registration with phone only", () => {
    expect(registerSchema.safeParse({ ...base, phone: "+15550102" }).success).toBe(true);
  });

  it("rejects registration with neither email nor phone", () => {
    const result = registerSchema.safeParse(base);
    expect(result.success).toBe(false);
  });

  it("rejects registration without accepting terms", () => {
    const result = registerSchema.safeParse({ ...base, email: "a@b.com", acceptedTerms: false });
    expect(result.success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts identifier + password", () => {
    expect(loginSchema.safeParse({ identifier: "a@b.com", password: "x" }).success).toBe(true);
  });

  it("rejects an empty password", () => {
    expect(loginSchema.safeParse({ identifier: "a@b.com", password: "" }).success).toBe(false);
  });
});

describe("verifyOtpSchema", () => {
  it("accepts a 6-digit code", () => {
    expect(
      verifyOtpSchema.safeParse({ otpChallengeId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", code: "123456" })
        .success,
    ).toBe(true);
  });

  it("rejects a non-6-digit code", () => {
    expect(
      verifyOtpSchema.safeParse({ otpChallengeId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", code: "12a456" })
        .success,
    ).toBe(false);
  });
});
