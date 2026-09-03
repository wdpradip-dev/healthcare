"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-provider";
import { useHospitalScope } from "@/lib/hospital-scope";
import { isSuperAdmin } from "@/lib/permissions";
import { hospitalsApi } from "@/lib/resources";

/** Super-Admin-only — docs/09-ADMIN-DESIGN-MOCKUPS.md "Shell": "Hospital switcher in topbar appears only for SUPER_ADMIN." */
export function HospitalSwitcher() {
  const { user, accessToken } = useAuth();
  const { selectedHospitalId, setSelectedHospitalId } = useHospitalScope();

  const { data: hospitals } = useQuery({
    queryKey: ["hospitals"],
    queryFn: () => hospitalsApi.list(accessToken!),
    enabled: Boolean(accessToken) && isSuperAdmin(user),
  });

  if (!isSuperAdmin(user)) {
    return null;
  }

  return (
    <select
      aria-label="Hospital"
      className="h-9 rounded-sm border border-outline bg-surface px-2 text-sm text-on-surface"
      value={selectedHospitalId ?? ""}
      onChange={(e) => setSelectedHospitalId(e.target.value || null)}
    >
      <option value="">Select a hospital…</option>
      {hospitals?.map((hospital) => (
        <option key={hospital.id} value={hospital.id}>
          {hospital.name}
        </option>
      ))}
    </select>
  );
}
