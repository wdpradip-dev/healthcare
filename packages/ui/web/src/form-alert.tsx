import type { ReactNode } from "react";

export type FormAlertVariant = "error" | "success";

export interface FormAlertProps {
  variant?: FormAlertVariant;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<FormAlertVariant, string> = {
  error: "border-error/40 bg-error/10 text-error",
  success: "border-success/40 bg-success/10 text-success",
};

/** Top-of-form status banner (login failure, "check your email", etc.). */
export function FormAlert({ variant = "error", children }: FormAlertProps) {
  return (
    <div role="alert" className={`rounded-sm border px-4 py-3 text-sm ${VARIANT_CLASSES[variant]}`}>
      {children}
    </div>
  );
}
