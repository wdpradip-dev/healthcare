import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { passwordSchema } from "@hospital/validation";
import { AuthScreen, Button, FormAlert, TextField } from "@hospital/ui-native";
import { apiFetch, ApiError } from "@/lib/api-client";

// otpChallengeId/code arrive from the OTP Verification step (already
// confirmed valid there) rather than being re-entered here, matching
// docs/08-MOBILE-DESIGN-MOCKUPS.md "Reset Password" — this screen only
// collects the new password.
const resetPasswordFormSchema = z
  .object({
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });
type ResetPasswordFormInput = z.infer<typeof resetPasswordFormSchema>;

/** Reset Password — docs/08-MOBILE-DESIGN-MOCKUPS.md "Authentication > Reset Password". */
export default function ResetPassword() {
  const params = useLocalSearchParams<{ otpChallengeId: string; code: string }>();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormInput>({
    resolver: zodResolver(resetPasswordFormSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  const onSubmit = handleSubmit(async (input) => {
    setFormError(null);
    try {
      await apiFetch("/auth/reset-password", {
        method: "POST",
        body: { otpChallengeId: params.otpChallengeId, code: params.code, newPassword: input.newPassword },
      });
      router.replace("/login");
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    }
  });

  return (
    <AuthScreen title="Set a new password">
      {formError ? <FormAlert variant="error">{formError}</FormAlert> : null}
      <Controller
        control={control}
        name="newPassword"
        render={({ field }) => (
          <TextField
            label="New password"
            secureToggle
            autoComplete="new-password"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.newPassword?.message}
            hint={!errors.newPassword ? "Password must have 8+ characters, one uppercase letter, one number." : undefined}
          />
        )}
      />
      <Controller
        control={control}
        name="confirmPassword"
        render={({ field }) => (
          <TextField
            label="Confirm password"
            secureToggle
            autoComplete="new-password"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.confirmPassword?.message}
          />
        )}
      />
      <Button label="Reset Password" onPress={onSubmit} loading={isSubmitting} />
    </AuthScreen>
  );
}
