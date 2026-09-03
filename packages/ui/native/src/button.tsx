import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import type { PressableProps } from "react-native";
import { lightColors } from "@hospital/ui-tokens";

export type ButtonVariant = "primary" | "secondary" | "text";

export interface ButtonProps extends Omit<PressableProps, "style"> {
  label: string;
  variant?: ButtonVariant;
  loading?: boolean;
}

/** Base button primitive — see docs/07-DESIGN-SYSTEM.md "Components > Buttons". */
export function Button({ label, variant = "primary", loading = false, disabled, ...rest }: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        variant === "primary" && styles.primary,
        variant === "secondary" && styles.secondary,
        variant === "text" && styles.text,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? lightColors.onPrimary : lightColors.primary} />
      ) : (
        <Text
          style={[
            styles.labelBase,
            variant === "primary" && styles.labelPrimary,
            variant !== "primary" && styles.labelOnSurface,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 48,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    width: "100%",
  },
  primary: { backgroundColor: lightColors.primary },
  secondary: { backgroundColor: lightColors.surfaceContainer, borderWidth: 1, borderColor: lightColors.outline },
  text: { backgroundColor: "transparent" },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  labelBase: { fontSize: 15, fontWeight: "600" },
  labelPrimary: { color: lightColors.onPrimary },
  labelOnSurface: { color: lightColors.primary },
});
