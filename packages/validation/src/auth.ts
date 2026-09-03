import { z } from "zod";

/**
 * Auth DTO schemas — mirrors docs/15-API-SPECIFICATION.md "/auth" and
 * docs/16-AUTHENTICATION.md exactly. Consumed by apps/api (server-side
 * validation) and, later, by the admin/mobile forms (React Hook Form
 * resolver) — one schema, never two independently maintained copies.
 */

// Password policy: >= 8 chars, at least one uppercase letter, at least one number.
// docs/16-AUTHENTICATION.md "Password policy".
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(128)
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter.")
  .regex(/[0-9]/, "Password must contain at least one number.");

const identifierRefinement = <T extends { email?: string; phone?: string }>(data: T, ctx: z.RefinementCtx) => {
  if (!data.email && !data.phone) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "At least one of email or phone is required.",
      path: ["email"],
    });
  }
};

export const registerSchema = z
  .object({
    name: z.string().min(1, "Name is required.").max(200),
    email: z.string().email().optional(),
    phone: z.string().min(7).max(20).optional(),
    password: passwordSchema,
    acceptedTerms: z.literal(true, {
      errorMap: () => ({ message: "You must accept the Terms & Privacy Policy." }),
    }),
  })
  .superRefine(identifierRefinement);

export type RegisterInput = z.infer<typeof registerSchema>;

export const verifyOtpSchema = z.object({
  otpChallengeId: z.string().uuid(),
  code: z.string().length(6, "Code must be 6 digits.").regex(/^\d{6}$/, "Code must be 6 digits."),
});

export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

export const resendOtpSchema = z.object({
  otpChallengeId: z.string().uuid(),
});

export type ResendOtpInput = z.infer<typeof resendOtpSchema>;

export const loginSchema = z.object({
  identifier: z.string().min(1, "Email or phone is required."),
  password: z.string().min(1, "Password is required."),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export type RefreshInput = z.infer<typeof refreshSchema>;

export const forgotPasswordSchema = z.object({
  identifier: z.string().min(1, "Email or phone is required."),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  otpChallengeId: z.string().uuid(),
  code: z.string().length(6, "Code must be 6 digits.").regex(/^\d{6}$/, "Code must be 6 digits."),
  newPassword: passwordSchema,
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

// Note: account activation (POST /users/activate) belongs to the /users
// domain per docs/15-API-SPECIFICATION.md, not /auth — it depends on the
// staff-invite flow (Phase 4's Users module, T-404), which doesn't exist yet.
// Its schema is added to a future packages/validation/src/users.ts alongside
// that module, not here.

export const revokeSessionParamsSchema = z.object({
  id: z.string().uuid(),
});
