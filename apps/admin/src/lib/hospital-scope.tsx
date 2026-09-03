"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useAuth } from "./auth-provider";
import { isSuperAdmin } from "./permissions";

/**
 * The hospital a Super Admin is currently operating against — every
 * hospital-scoped API call needs one, since a platform-level actor has no
 * implicit `hospitalId` on their own token (docs/18-MULTI-TENANCY.md). An
 * Admin's own `hospitalId` always wins server-side regardless of this value,
 * so for them this context is inert.
 */
interface HospitalScopeContextValue {
  selectedHospitalId: string | null;
  setSelectedHospitalId: (id: string | null) => void;
}

const HospitalScopeContext = createContext<HospitalScopeContextValue | null>(null);

export function HospitalScopeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [selectedHospitalId, setSelectedHospitalId] = useState<string | null>(null);

  const value = useMemo(() => {
    // An Admin's effective hospital is always their own — the switcher is
    // Super-Admin-only UI, so this keeps every other consumer simple.
    if (user && !isSuperAdmin(user)) {
      return { selectedHospitalId: user.hospitalId, setSelectedHospitalId };
    }
    return { selectedHospitalId, setSelectedHospitalId };
  }, [user, selectedHospitalId]);

  return <HospitalScopeContext.Provider value={value}>{children}</HospitalScopeContext.Provider>;
}

export function useHospitalScope(): HospitalScopeContextValue {
  const ctx = useContext(HospitalScopeContext);
  if (!ctx) {
    throw new Error("useHospitalScope() must be used within a <HospitalScopeProvider>.");
  }
  return ctx;
}
