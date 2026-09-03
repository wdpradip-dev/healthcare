"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-provider";
import { HospitalSwitcher } from "./hospital-switcher";

export function Topbar() {
  const router = useRouter();
  const { user, logout } = useAuth();

  const onLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-outline/20 bg-surface px-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-on-surface">Hospital Platform</span>
        <HospitalSwitcher />
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-on-surface-variant">{user?.name}</span>
        <button
          type="button"
          onClick={onLogout}
          className="rounded-sm px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary-container"
        >
          Log out
        </button>
      </div>
    </header>
  );
}
