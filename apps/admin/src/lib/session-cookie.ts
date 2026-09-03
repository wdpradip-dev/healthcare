import "server-only";
import { cookies } from "next/headers";
import { sealData, unsealData } from "iron-session";

/**
 * Refresh-token storage per docs/16-AUTHENTICATION.md's token-storage table:
 * for admin, the refresh token lives ONLY in an httpOnly/Secure/SameSite=Strict
 * cookie — never in JS-readable storage. Per docs/33-ENVIRONMENT-VARIABLES.md
 * (`SESSION_COOKIE_SECRET`: "signs/encrypts the admin's auth cookie wrapper"),
 * the cookie value itself is sealed (AES-GCM encrypted + signed via
 * iron-session) rather than storing the raw opaque token, so a copied cookie
 * value is useless without the server-held secret.
 *
 * The access token is deliberately NOT stored here; it stays in the
 * browser's memory only (see auth-provider.tsx) and is re-obtained by
 * exchanging this cookie via POST /api/session/refresh.
 */
const REFRESH_TOKEN_COOKIE = "hp_admin_rt";

function sessionSecret(): string {
  const secret = process.env.SESSION_COOKIE_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_COOKIE_SECRET is not configured (must be >= 32 chars) — see docs/33-ENVIRONMENT-VARIABLES.md.",
    );
  }
  return secret;
}

export async function setRefreshTokenCookie(refreshToken: string): Promise<void> {
  const sealed = await sealData({ refreshToken }, { password: sessionSecret() });
  cookies().set(REFRESH_TOKEN_COOKIE, sealed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    // Matches the staff refresh-token TTL (docs/16-AUTHENTICATION.md) — the
    // server-side RefreshToken row is still the source of truth for validity;
    // this is just the cookie's own expiry.
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function getRefreshTokenCookie(): Promise<string | undefined> {
  const sealed = cookies().get(REFRESH_TOKEN_COOKIE)?.value;
  if (!sealed) return undefined;
  try {
    const data = await unsealData<{ refreshToken: string }>(sealed, { password: sessionSecret() });
    return data.refreshToken;
  } catch {
    // Tampered, expired, or sealed under a rotated secret — treat as no session.
    return undefined;
  }
}

export function clearRefreshTokenCookie(): void {
  cookies().delete(REFRESH_TOKEN_COOKIE);
}
