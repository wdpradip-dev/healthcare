import { useState } from "react";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registerSchema, type RegisterInput } from "@hospital/validation";
import { AuthScreen, Button, FormAlert, TextField } from "@hospital/ui-native";
import { lightColors } from "@hospital/ui-tokens";
import { apiFetch, ApiError } from "@/lib/api-client";

interface RegisterResponse {
  userId: string;
  status: string;
  otpChallengeId: string;
  otpDeliveredTo: string;
}

/** Register — docs/08-MOBILE-DESIGN-MOCKUPS.md "Authentication > Register". */
export default function Register() {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", phone: "", password: "", acceptedTerms: false as unknown as true },
  });
  const acceptedTerms = watch("acceptedTerms");

  const onSubmit = handleSubmit(async (input) => {
    setFormError(null);
    try {
      const result = await apiFetch<RegisterResponse>("/auth/register", { method: "POST", body: input });
      router.push({
        pathname: "/otp-verify",
        params: { otpChallengeId: result.otpChallengeId, deliveredTo: result.otpDeliveredTo, purpose: "REGISTRATION" },
      });
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    }
  });

  return (
    <AuthScreen title="Create your account" onBack={() => router.back()}>
      {formError ? <FormAlert variant="error">{formError}</FormAlert> : null}
      <Controller
        control={control}
        name="name"
        render={({ field }) => (
          <TextField
            label="Full name"
            autoComplete="name"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.name?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="email"
        render={({ field }) => (
          <TextField
            label="Email"
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.email?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="phone"
        render={({ field }) => (
          <TextField
            label="Phone"
            keyboardType="phone-pad"
            autoComplete="tel"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.phone?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field }) => (
          <TextField
            label="Password"
            secureToggle
            autoComplete="new-password"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.password?.message}
            hint={!errors.password ? "At least 8 characters, with an uppercase letter and a number." : undefined}
          />
        )}
      />
      <Controller
        control={control}
        name="acceptedTerms"
        render={({ field }) => (
          <Pressable
            style={styles.checkboxRow}
            onPress={() => field.onChange(!field.value)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: Boolean(field.value) }}
            accessibilityLabel="I agree to the Terms of Service and Privacy Policy"
          >
            <View style={[styles.checkbox, field.value && styles.checkboxChecked]} />
            <Text style={styles.checkboxLabel}>I agree to the Terms of Service and Privacy Policy</Text>
          </Pressable>
        )}
      />
      {errors.acceptedTerms ? <FormAlert variant="error">{errors.acceptedTerms.message ?? "Required."}</FormAlert> : null}
      <Button label="Create Account" onPress={onSubmit} loading={isSubmitting} disabled={!acceptedTerms} />
      <Pressable onPress={() => router.push("/login")} hitSlop={8} style={styles.footerLink}>
        <Text style={styles.footerText}>
          Already have an account? <Text style={styles.link}>Log in</Text>
        </Text>
      </Pressable>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  checkboxRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, borderColor: lightColors.outline },
  checkboxChecked: { backgroundColor: lightColors.primary, borderColor: lightColors.primary },
  checkboxLabel: { flex: 1, fontSize: 13, color: lightColors.onSurface },
  link: { color: lightColors.primary, fontWeight: "600", fontSize: 14 },
  footerLink: { alignItems: "center", marginTop: 8 },
  footerText: { fontSize: 14, color: lightColors.onSurfaceVariant },
});
