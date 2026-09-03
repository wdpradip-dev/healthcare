"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { passwordSchema } from "@hospital/validation";
import { AuthShell, Button, FormAlert, TextField } from "@hospital/ui-web";
import { activateAccountAction, requestActivationOtpAction } from "./actions";

// The activation token is carried in the emailed link's query string, not
// user-entered — this form only collects the OTP (second factor, proves
// live inbox access right now) and the new password. See
// docs/16-AUTHENTICATION.md "Staff activation".
const activateFormSchema = z.object({
  code: z.string().length(6, "Code must be 6 digits.").regex(/^\d{6}$/, "Code must be 6 digits."),
  password: passwordSchema,
});
type ActivateFormInput = z.infer<typeof activateFormSchema>;

function ActivateAccountForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activationToken = searchParams.get("token") ?? "";
  const [otpChallengeId, setOtpChallengeId] = useState<string | null>(null);
  const [deliveredTo, setDeliveredTo] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ActivateFormInput>({ resolver: zodResolver(activateFormSchema) });

  useEffect(() => {
    if (!activationToken) {
      setRequestError("This activation link is missing its token.");
      return;
    }
    void requestActivationOtpAction(activationToken).then((result) => {
      if (result.ok) {
        setOtpChallengeId(result.otpChallengeId);
        setDeliveredTo(result.otpDeliveredTo);
      } else {
        setRequestError(result.message);
      }
    });
    // Runs once for the token carried in the URL, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activationToken]);

  const onSubmit = handleSubmit(async (input) => {
    if (!otpChallengeId) return;
    setFormError(null);
    const result = await activateAccountAction({ activationToken, otpChallengeId, ...input });
    if (!result.ok) {
      setFormError(result.message);
      return;
    }
    router.push("/login");
  });

  if (requestError) {
    return (
      <AuthShell title="Activation link invalid">
        <FormAlert variant="error">{requestError}</FormAlert>
        <p className="mt-4 text-sm text-on-surface-variant">Ask your Admin to send a new invite.</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Activate your account"
      subtitle={deliveredTo ? `Enter the 6-digit code we sent to ${deliveredTo} and choose a password.` : "Sending your verification code…"}
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
          label="Password"
          type="password"
          autoComplete="new-password"
          hint={!errors.password ? "At least 8 characters, with an uppercase letter and a number." : undefined}
          error={errors.password?.message}
          {...register("password")}
        />
        <Button type="submit" loading={isSubmitting} disabled={!otpChallengeId}>
          Activate Account
        </Button>
      </form>
    </AuthShell>
  );
}

export default function ActivateAccountPage() {
  return (
    <Suspense>
      <ActivateAccountForm />
    </Suspense>
  );
}
