"use server";

import type { ActivateUserInput } from "@hospital/validation";
import { ApiError, apiFetch } from "@/lib/api-client";

export type RequestActivationOtpResult =
  | { ok: true; otpChallengeId: string; otpDeliveredTo: string }
  | { ok: false; message: string };

export async function requestActivationOtpAction(activationToken: string): Promise<RequestActivationOtpResult> {
  try {
    const result = await apiFetch<{ otpChallengeId: string; otpDeliveredTo: string }>("/users/activate/request-otp", {
      method: "POST",
      body: { activationToken },
    });
    return { ok: true, ...result };
  } catch (error) {
    const message = error instanceof ApiError ? error.message : "Something went wrong. Please try again.";
    return { ok: false, message };
  }
}

export type ActivateAccountResult = { ok: true } | { ok: false; message: string };

export async function activateAccountAction(input: ActivateUserInput): Promise<ActivateAccountResult> {
  try {
    await apiFetch<{ success: true }>("/users/activate", { method: "POST", body: input });
    return { ok: true };
  } catch (error) {
    const message = error instanceof ApiError ? error.message : "Something went wrong. Please try again.";
    return { ok: false, message };
  }
}
