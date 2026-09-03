import { NextResponse } from "next/server";
import { clearRefreshTokenCookie } from "@/lib/session-cookie";

/**
 * Ends the local session by discarding the sealed refresh-token cookie.
 * Does not call `POST /auth/logout` (which revokes one specific
 * `DeviceSession` by id) — the admin client never holds a session id, only
 * the opaque refresh token itself, so there is nothing to pass it. The
 * refresh token becomes unusable the moment this cookie is gone; the
 * corresponding `DeviceSession`/`RefreshToken` rows age out naturally. Full
 * server-side single-session revocation on manual logout is a small,
 * clearly-scoped follow-up (thread a session id through login/me) rather
 * than something to bolt on here speculatively.
 */
export async function POST() {
  clearRefreshTokenCookie();
  return NextResponse.json({ success: true });
}
