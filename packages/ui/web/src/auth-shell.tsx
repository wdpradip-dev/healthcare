import type { ReactNode } from "react";

export interface AuthShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/** Centered card shell shared by every unauthenticated admin screen (login, forgot/reset password). */
export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-surface-container px-4 py-12">
      <div className="w-full max-w-sm rounded-md border border-outline/30 bg-surface p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-on-surface">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-on-surface-variant">{subtitle}</p> : null}
        <div className="mt-6">{children}</div>
      </div>
      {footer ? <div className="mt-6 text-sm text-on-surface-variant">{footer}</div> : null}
    </main>
  );
}
