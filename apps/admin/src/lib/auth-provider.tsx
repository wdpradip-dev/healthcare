"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

/**
 * Holds the access token in browser memory only — never localStorage, never
 * a JS-readable cookie (docs/16-AUTHENTICATION.md). Lost on tab close/reload
 * by design; `bootstrap()` silently re-derives it from the httpOnly refresh
 * cookie via POST /api/session/refresh, which is why every page under the
 * authenticated app (starting Phase 4's admin shell) mounts this provider
 * once near the root and calls `bootstrap()` on load.
 */
export interface SessionUser {
  id: string;
  name: string;
  hospitalId: string | null;
  roles: string[];
  permissions: string[];
  /** Own Doctor.id, null if none — Phase 6, lets a DOCTOR-role session
   * self-target `/schedules/:doctorId` without needing `doctors.read`. */
  doctorId: string | null;
}

interface AuthContextValue {
  accessToken: string | null;
  user: SessionUser | null;
  isBootstrapping: boolean;
  setSession: (accessToken: string, user: SessionUser) => void;
  clearSession: () => void;
  bootstrap: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  const setSession = useCallback((token: string, sessionUser: SessionUser) => {
    setAccessToken(token);
    setUser(sessionUser);
  }, []);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
  }, []);

  const bootstrap = useCallback(async () => {
    setIsBootstrapping(true);
    try {
      const response = await fetch("/api/session/refresh", { method: "POST" });
      if (!response.ok) {
        clearSession();
        return;
      }
      const data = (await response.json()) as { accessToken: string; user: SessionUser };
      setSession(data.accessToken, data.user);
    } catch {
      clearSession();
    } finally {
      setIsBootstrapping(false);
    }
  }, [clearSession, setSession]);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/session/logout", { method: "POST" });
    } finally {
      clearSession();
    }
  }, [clearSession]);

  useEffect(() => {
    void bootstrap();
    // Runs once on mount — this is the app-level session bootstrap, not tied to any input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(
    () => ({ accessToken, user, isBootstrapping, setSession, clearSession, bootstrap, logout }),
    [accessToken, user, isBootstrapping, setSession, clearSession, bootstrap, logout],
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
