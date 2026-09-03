"use server";

import type { LoginInput } from "@hospital/validation";
import { ApiError, apiFetch } from "@/lib/api-client";
import { setRefreshTokenCookie } from "@/lib/session-cookie";

export type LoginActionResult =
  | {
      ok: true;
      accessToken: string;
      user: { id: string; name: string; hospitalId: string | null; roles: string[]; permissions: string[] };
    }
  | { ok: false; code: string; message: string };

interface AuthTokensResponse {
  accessToken: string;
  refreshToken: string;
  user: { id: string; name: string; hospitalId: string | null; roles: string[]; permissions: string[] };
}

export async function loginAction(input: LoginInput): Promise<LoginActionResult> {
  try {
    const tokens = await apiFetch<AuthTokensResponse>("/auth/login", { method: "POST", body: input });
    await setRefreshTokenCookie(tokens.refreshToken);
    return { ok: true, accessToken: tokens.accessToken, user: tokens.user };
  } catch (error) {
    if (error instanceof ApiError) {
      return { ok: false, code: error.code, message: error.message };
    }
    return { ok: false, code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." };
  }
}
