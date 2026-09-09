import { NextResponse } from "next/server";
import { ApiError, apiFetch } from "@/lib/api-client";
import { clearRefreshTokenCookie, getRefreshTokenCookie, setRefreshTokenCookie } from "@/lib/session-cookie";

/**
 * Exchanges the httpOnly refresh-token cookie for a fresh access token,
 * without ever exposing the refresh token itself to client-side JS
 * (docs/16-AUTHENTICATION.md). Called by AuthProvider.bootstrap() on every
 * app load, and by any client code that catches a 401 from the API.
 */
export async function POST() {
  const refreshToken = await getRefreshTokenCookie();
  if (!refreshToken) {
    return NextResponse.json({ error: { code: "AUTH_SESSION_EXPIRED", message: "No active session." } }, { status: 401 });
  }

  try {
    const { accessToken, refreshToken: rotatedRefreshToken } = await apiFetch<{
      accessToken: string;
      refreshToken: string;
    }>("/auth/refresh", { method: "POST", body: { refreshToken } });

    await setRefreshTokenCookie(rotatedRefreshToken);

    const user = await apiFetch<{
      id: string;
      name: string;
      hospitalId: string | null;
      roles: string[];
      permissions: string[];
      doctorId: string | null;
    }>("/auth/me", { accessToken });

    return NextResponse.json({ accessToken, user });
  } catch (error) {
    clearRefreshTokenCookie();
    const message = error instanceof ApiError ? error.message : "Session expired. Please log in again.";
    return NextResponse.json({ error: { code: "AUTH_SESSION_EXPIRED", message } }, { status: 401 });
  }
}
