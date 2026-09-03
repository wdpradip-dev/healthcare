"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth-provider";
import { ShellLayout } from "@/components/shell/shell-layout";

/** Auth guard for every authenticated route — T-405. */
export default function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, isBootstrapping } = useAuth();

  useEffect(() => {
    if (!isBootstrapping && !user) {
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

  return <ShellLayout>{children}</ShellLayout>;
}
