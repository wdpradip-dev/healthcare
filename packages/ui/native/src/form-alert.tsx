import { StyleSheet, Text, View } from "react-native";
import { lightColors } from "@hospital/ui-tokens";

export type FormAlertVariant = "error" | "success";

export interface FormAlertProps {
  variant?: FormAlertVariant;
  children: string;
}

/** Top-of-form status banner (login failure, OTP error, etc.) — `role=alert` equivalent via accessibilityLiveRegion. */
export function FormAlert({ variant = "error", children }: FormAlertProps) {
  return (
    <View
      style={[styles.base, variant === "error" ? styles.error : styles.success]}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      <Text style={variant === "error" ? styles.textError : styles.textSuccess}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: 8, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 14 },
  error: { borderColor: lightColors.errorContainer, backgroundColor: lightColors.errorContainer },
  success: { borderColor: lightColors.successContainer, backgroundColor: lightColors.successContainer },
  textError: { color: lightColors.onErrorContainer, fontSize: 13 },
  textSuccess: { color: lightColors.onSuccessContainer, fontSize: 13 },
});
