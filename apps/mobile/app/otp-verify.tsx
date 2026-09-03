import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, StyleSheet, Text } from "react-native";
import { AuthScreen, Button, FormAlert, OtpInput } from "@hospital/ui-native";
import { lightColors } from "@hospital/ui-tokens";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import type { AuthTokensResponse } from "@/lib/auth-context";

const RESEND_COOLDOWN_SECONDS = 30;

type VerifyOtpResponse =
  | { purpose: "REGISTRATION"; tokens: AuthTokensResponse }
  | { purpose: "PASSWORD_RESET" | "LOGIN_VERIFICATION"; verified: true };

/** OTP Verification — docs/08-MOBILE-DESIGN-MOCKUPS.md "Authentication > OTP Verification". */
export default function OtpVerify() {
  const params = useLocalSearchParams<{ otpChallengeId: string; deliveredTo: string; purpose: string }>();
  const { setSession } = useAuth();
  const [otpChallengeId, setOtpChallengeId] = useState(params.otpChallengeId);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const verify = async (fullCode: string) => {
    setError(null);
    setIsVerifying(true);
    try {
      const result = await apiFetch<VerifyOtpResponse>("/auth/verify-otp", {
        method: "POST",
        body: { otpChallengeId, code: fullCode },
      });
      if (result.purpose === "REGISTRATION") {
        await setSession(result.tokens);
        router.replace("/");
        return;
      }
      router.replace({
        pathname: "/reset-password",
        params: { otpChallengeId, code: fullCode },
      });
    } catch (err) {
      setCode("");
      if (err instanceof ApiError) {
        setError(
          err.code === "AUTH_OTP_EXPIRED"
            ? "Code expired. Please request a new one."
            : err.code === "AUTH_OTP_MAX_ATTEMPTS"
              ? err.message
              : "Incorrect code.",
        );
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const resend = async () => {
    setError(null);
    setIsResending(true);
    try {
      const result = await apiFetch<{ otpChallengeId: string; otpDeliveredTo: string }>("/auth/resend-otp", {
        method: "POST",
        body: { otpChallengeId },
      });
      setOtpChallengeId(result.otpChallengeId);
      setCode("");
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsResending(false);
    }
  };

  return (
    <AuthScreen
      title={params.purpose === "PASSWORD_RESET" ? "Enter reset code" : "Verify your account"}
      subtitle={`We sent a code to ${params.deliveredTo}`}
      onBack={() => router.back()}
    >
      {error ? <FormAlert variant="error">{error}</FormAlert> : null}
      <OtpInput value={code} onChange={setCode} onComplete={verify} error={Boolean(error)} />
      <Text style={styles.countdown} accessibilityLiveRegion="polite">
        {cooldown > 0
          ? `Resend code in 0:${cooldown.toString().padStart(2, "0")}`
          : isResending
            ? "Sending…"
            : "Didn't get a code?"}
      </Text>
      {cooldown === 0 ? (
        <Pressable onPress={resend} disabled={isResending} hitSlop={8}>
          <Text style={styles.resendLink}>Resend code</Text>
        </Pressable>
      ) : null}
      <Button label="Verify" onPress={() => verify(code)} loading={isVerifying} disabled={code.length !== 6} />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  countdown: { fontSize: 13, color: lightColors.onSurfaceVariant, textAlign: "center" },
  resendLink: { fontSize: 14, fontWeight: "600", color: lightColors.primary, textAlign: "center" },
});
