"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { passwordSchema } from "@hospital/validation";
import { AuthShell, Button, FormAlert, TextField } from "@hospital/ui-web";
import { resetPasswordAction } from "./actions";

// otpChallengeId is carried from the forgot-password step's query string, not
// user-entered, so it's excluded from client-side validation: whether or not
// an account exists, the form always behaves identically here (no
// enumeration signal) and lets the server reject an empty/invalid challenge
// with the same generic error a wrong code would get.
const resetPasswordFormSchema = z.object({
  code: z.string().length(6, "Code must be 6 digits.").regex(/^\d{6}$/, "Code must be 6 digits."),
  newPassword: passwordSchema,
});
type ResetPasswordFormInput = z.infer<typeof resetPasswordFormSchema>;

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const otpChallengeId = searchParams.get("challengeId") ?? "";
  const deliveredTo = searchParams.get("deliveredTo");
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormInput>({ resolver: zodResolver(resetPasswordFormSchema) });

  const onSubmit = handleSubmit(async (input) => {
    setFormError(null);
    const result = await resetPasswordAction({ ...input, otpChallengeId });
    if (!result.ok) {
      setFormError(result.message);
      return;
    }
    router.push("/login");
  });

  return (
    <AuthShell
      title="Reset password"
      subtitle={deliveredTo ? `Enter the 6-digit code we sent to ${deliveredTo}.` : "Enter the 6-digit code from your email or SMS."}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {formError ? <FormAlert variant="error">{formError}</FormAlert> : null}
        <TextField
          label="6-digit code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          error={errors.code?.message}
          {...register("code")}
        />
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters, with an uppercase letter and a number."
          error={errors.newPassword?.message}
          {...register("newPassword")}
        />
        <Button type="submit" loading={isSubmitting}>
          Reset password
        </Button>
        <p className="text-center text-sm text-on-surface-variant">
          <Link href="/login" className="text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
