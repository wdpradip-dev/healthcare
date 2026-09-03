"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@hospital/validation";
import { AuthShell, Button, FormAlert, TextField } from "@hospital/ui-web";
import { forgotPasswordAction } from "./actions";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = handleSubmit(async (input) => {
    setFormError(null);
    const result = await forgotPasswordAction(input);
    if (!result.ok) {
      setFormError(result.message);
      return;
    }
    const params = new URLSearchParams({ deliveredTo: result.otpDeliveredTo });
    if (result.otpChallengeId) {
      params.set("challengeId", result.otpChallengeId);
    }
    router.push(`/reset-password?${params.toString()}`);
  });

  return (
    <AuthShell
      title="Forgot password"
      subtitle="Enter the email or phone number on your account and we'll send you a reset code."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {formError ? <FormAlert variant="error">{formError}</FormAlert> : null}
        <TextField
          label="Email or phone"
          autoComplete="username"
          error={errors.identifier?.message}
          {...register("identifier")}
        />
        <Button type="submit" loading={isSubmitting}>
          Send reset code
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
