import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { apiFetch } from "./api-client";
import { clearRefreshToken, getRefreshToken, saveRefreshToken } from "./secure-storage";

/**
 * Access token lives in memory only, re-derived from the SecureStore-backed
 * refresh token on cold start (docs/16-AUTHENTICATION.md) — see Splash
 * (app/index.tsx), which is where `bootstrap()` runs.
 */
export interface SessionUser {
  id: string;
  name: string;
  roles: string[];
  permissions: string[];
}

interface AuthTokensResponse {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}

interface AuthContextValue {
  accessToken: string | null;
  user: SessionUser | null;
  isBootstrapping: boolean;
  setSession: (tokens: { accessToken: string; refreshToken: string; user: SessionUser }) => Promise<void>;
  clearSession: () => Promise<void>;
  bootstrap: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  const setSession = useCallback(
    async (tokens: { accessToken: string; refreshToken: string; user: SessionUser }) => {
      await saveRefreshToken(tokens.refreshToken);
      setAccessToken(tokens.accessToken);
      setUser(tokens.user);
    },
    [],
  );

  const clearSession = useCallback(async () => {
    await clearRefreshToken();
    setAccessToken(null);
    setUser(null);
  }, []);

  const bootstrap = useCallback(async () => {
    setIsBootstrapping(true);
    try {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) {
        setAccessToken(null);
        setUser(null);
        return;
      }
      const tokens = await apiFetch<{ accessToken: string; refreshToken: string }>("/auth/refresh", {
        method: "POST",
        body: { refreshToken },
      });
      const me = await apiFetch<SessionUser>("/auth/me", { accessToken: tokens.accessToken });
      await saveRefreshToken(tokens.refreshToken);
      setAccessToken(tokens.accessToken);
      setUser(me);
    } catch {
      // An expired/revoked refresh token is expected (session lapsed) — fall
      // through to signed-out state silently, matching Splash's documented
      // "silent failure → Welcome" behavior. Anything else still lands here
      // safely: whatever the cause, there is no usable session.
      await clearRefreshToken();
      setAccessToken(null);
      setUser(null);
    } finally {
      setIsBootstrapping(false);
    }
  }, []);

  useEffect(() => {
    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(
    () => ({ accessToken, user, isBootstrapping, setSession, clearSession, bootstrap }),
    [accessToken, user, isBootstrapping, setSession, clearSession, bootstrap],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth() must be used within an <AuthProvider>.");
  }
  return ctx;
}

export type { AuthTokensResponse };
