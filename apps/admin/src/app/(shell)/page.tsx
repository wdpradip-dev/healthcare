"use client";

import { useAuth } from "@/lib/auth-provider";

/**
 * Shell landing page. The real Dashboard (KPI cards, charts) needs
 * `analytics.read` + `GET /analytics/overview`, which don't exist until
 * Phase 11 — this is a placeholder home, not a stub Dashboard pretending
 * to be finished.
 */
export default function ShellHome() {
  const { user } = useAuth();
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold text-on-surface">Welcome, {user?.name}</h1>
      <p className="text-on-surface-variant">
        The Dashboard is built starting Phase 11. Use the sidebar to manage Branches, Departments, and Users.
      </p>
    </div>
  );
}
