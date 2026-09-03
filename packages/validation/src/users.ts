import { z } from "zod";
import { passwordSchema } from "./auth";

/**
 * `/users` DTO schemas — mirrors docs/15-API-SPECIFICATION.md "/users" and
 * the invite/activation flow in docs/16-AUTHENTICATION.md "Staff activation".
 * Only staff/doctor roles are invitable here — Patients self-register
 * (`/auth/register`), and Super Admin is bootstrapped separately (never
 * invited, docs/25-SECURITY.md) — so `roleKey` is deliberately a narrower
 * enum than the full `SystemRole` union.
 */
const invitableRoleKeySchema = z.enum(["DOCTOR", "NURSE", "RECEPTIONIST", "ADMIN"]);
export type InvitableRoleKey = z.infer<typeof invitableRoleKeySchema>;

const identifierRefinement = <T extends { email?: string; phone?: string }>(data: T, ctx: z.RefinementCtx) => {
  if (!data.email && !data.phone) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "At least one of email or phone is required.",
      path: ["email"],
    });
  }
};

export const inviteUserSchema = z
  .object({
    // Required for a Super Admin (platform-scope) caller — see
    // apps/api/src/common/tenant-scope.util.ts.
    hospitalId: z.string().uuid().optional(),
    name: z.string().min(1, "Name is required.").max(200),
    email: z.string().email().optional(),
    phone: z.string().min(7).max(20).optional(),
    roleKey: invitableRoleKeySchema,
    // Staff-only placement, applied to the auto-provisioned Staff row (a
    // Doctor invite ignores these — their assignment happens via a
    // subsequent POST /doctors, Phase 5).
    branchId: z.string().uuid().optional(),
    jobTitle: z.string().max(200).optional(),
  })
  .superRefine(identifierRefinement);

export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export const updateUserSchema = z.object({
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
  roleKey: invitableRoleKeySchema.optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const listUsersQuerySchema = z.object({
  // Required for a Super Admin (platform-scope) caller — see
  // apps/api/src/common/tenant-scope.util.ts.
  hospitalId: z.string().uuid().optional(),
  role: invitableRoleKeySchema.optional(),
  status: z.enum(["PENDING_ACTIVATION", "ACTIVE", "LOCKED", "DISABLED"]).optional(),
  branchId: z.string().uuid().optional(),
  query: z.string().optional(),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

export const requestActivationOtpSchema = z.object({
  activationToken: z.string().min(1),
});

export type RequestActivationOtpInput = z.infer<typeof requestActivationOtpSchema>;

export const activateUserSchema = z.object({
  activationToken: z.string().min(1),
  otpChallengeId: z.string().uuid(),
  code: z.string().length(6, "Code must be 6 digits.").regex(/^\d{6}$/, "Code must be 6 digits."),
  password: passwordSchema,
});

export type ActivateUserInput = z.infer<typeof activateUserSchema>;
