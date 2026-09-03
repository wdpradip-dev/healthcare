"use server";

import type { ResetPasswordInput } from "@hospital/validation";
import { ApiError, apiFetch } from "@/lib/api-client";

export type ResetPasswordActionResult = { ok: true } | { ok: false; message: string };

export async function resetPasswordAction(input: ResetPasswordInput): Promise<ResetPasswordActionResult> {
  try {
    await apiFetch<{ success: true }>("/auth/reset-password", { method: "POST", body: input });
    return { ok: true };
  } catch (error) {
    const message = error instanceof ApiError ? error.message : "Something went wrong. Please try again.";
    return { ok: false, message };
  }
}
