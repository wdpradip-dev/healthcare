"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-provider";

/**
 * Root landing page. The authenticated app shell (sidebar/topbar, dashboard)
 * is T-405, Phase 4 — until then this just routes to the right place based
 * on session state established by Login (T-310).
 */
export default function Home() {
  const router = useRouter();
  const { user, isBootstrapping } = useAuth();

  useEffect(() => {
    if (isBootstrapping) return;
    if (!user) {
      router.replace("/login");
    }
  }, [isBootstrapping, user, router]);

  if (isBootstrapping) {
    return (
      <main className="flex min-h-screen items-center justify-center text-on-surface-variant">
        <p>Loading…</p>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-8">
      <h1 className="text-2xl font-semibold text-on-surface">Welcome, {user.name}</h1>
      <p className="text-on-surface-variant">
        The admin dashboard shell is built in Phase 4. See docs/42-PROJECT-STATE.md for current status.
      </p>
    </main>
  );
}
