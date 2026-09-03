import { useState } from "react";
import { router } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@hospital/validation";
import { AuthScreen, Button, FormAlert, TextField } from "@hospital/ui-native";
import { apiFetch, ApiError } from "@/lib/api-client";

/** Forgot Password — docs/08-MOBILE-DESIGN-MOCKUPS.md "Authentication > Forgot Password". */
export default function ForgotPassword() {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { identifier: "" } });

  const onSubmit = handleSubmit(async (input) => {
    setFormError(null);
    try {
      const result = await apiFetch<{ otpChallengeId: string | null; otpDeliveredTo: string }>(
        "/auth/forgot-password",
        { method: "POST", body: input },
      );
      router.push({
        pathname: "/otp-verify",
        params: { otpChallengeId: result.otpChallengeId ?? "", deliveredTo: result.otpDeliveredTo, purpose: "PASSWORD_RESET" },
      });
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    }
  });

  return (
    <AuthScreen title="Reset your password" subtitle="Enter the email or phone on your account" onBack={() => router.back()}>
      {formError ? <FormAlert variant="error">{formError}</FormAlert> : null}
      <Controller
        control={control}
        name="identifier"
        render={({ field }) => (
          <TextField
            label="Email or phone"
            autoCapitalize="none"
            autoComplete="username"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.identifier?.message}
          />
        )}
      />
      <Button label="Send Code" onPress={onSubmit} loading={isSubmitting} />
    </AuthScreen>
  );
}
