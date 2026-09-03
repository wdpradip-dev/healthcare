import { useState } from "react";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text } from "react-native";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@hospital/validation";
import { AuthScreen, Button, FormAlert, TextField } from "@hospital/ui-native";
import { lightColors } from "@hospital/ui-tokens";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import type { AuthTokensResponse } from "@/lib/auth-context";

/** Login — docs/08-MOBILE-DESIGN-MOCKUPS.md "Authentication > Login". */
export default function Login() {
  const { setSession } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { identifier: "", password: "" } });

  const onSubmit = handleSubmit(async (input) => {
    setFormError(null);
    try {
      const tokens = await apiFetch<AuthTokensResponse>("/auth/login", { method: "POST", body: input });
      await setSession(tokens);
      router.replace("/");
    } catch (error) {
      // AUTH_ACCOUNT_PENDING_ACTIVATION here means registration was never
      // finished. Resuming that OTP challenge from just an identifier isn't
      // supported by the API yet (no "resend registration OTP" endpoint) —
      // shown as a plain message rather than a broken auto-navigation.
      setFormError(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    }
  });

  return (
    <AuthScreen title="Welcome back" onBack={() => router.back()}>
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
      <Controller
        control={control}
        name="password"
        render={({ field }) => (
          <TextField
            label="Password"
            secureToggle
            autoComplete="current-password"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.password?.message}
          />
        )}
      />
      <Pressable onPress={() => router.push("/forgot-password")} hitSlop={8}>
        <Text style={styles.link}>Forgot password?</Text>
      </Pressable>
      <Button label="Log In" onPress={onSubmit} loading={isSubmitting} />
      <Pressable onPress={() => router.push("/register")} hitSlop={8} style={styles.footerLink}>
        <Text style={styles.footerText}>
          Don&apos;t have an account? <Text style={styles.link}>Sign up</Text>
        </Text>
      </Pressable>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  link: { color: lightColors.primary, fontWeight: "600", fontSize: 14 },
  footerLink: { alignItems: "center", marginTop: 8 },
  footerText: { fontSize: 14, color: lightColors.onSurfaceVariant },
});
