"use server";

import type { ForgotPasswordInput } from "@hospital/validation";
import { ApiError, apiFetch } from "@/lib/api-client";

export type ForgotPasswordActionResult =
  | { ok: true; otpChallengeId: string | null; otpDeliveredTo: string }
  | { ok: false; message: string };

export async function forgotPasswordAction(input: ForgotPasswordInput): Promise<ForgotPasswordActionResult> {
  try {
    const result = await apiFetch<{ otpChallengeId: string | null; otpDeliveredTo: string }>(
      "/auth/forgot-password",
      { method: "POST", body: input },
    );
    return { ok: true, ...result };
  } catch (error) {
    const message = error instanceof ApiError ? error.message : "Something went wrong. Please try again.";
    return { ok: false, message };
  }
}
