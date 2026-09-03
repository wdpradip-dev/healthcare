import { forwardRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { TextInputProps } from "react-native";
import { lightColors } from "@hospital/ui-tokens";

export interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string;
  hint?: string;
  secureToggle?: boolean;
}

/** Labeled text input with inline error and optional password-visibility toggle. */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, hint, secureToggle = false, secureTextEntry, style, ...rest },
  ref,
) {
  const [revealed, setRevealed] = useState(false);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputRow, error ? styles.inputRowError : undefined]}>
        <TextInput
          ref={ref}
          style={[styles.input, style]}
          placeholderTextColor={lightColors.onSurfaceVariant}
          secureTextEntry={secureToggle ? !revealed : secureTextEntry}
          accessibilityLabel={label}
          {...rest}
        />
        {secureToggle ? (
          <Pressable
            onPress={() => setRevealed((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={revealed ? "Hide password" : "Show password"}
            hitSlop={8}
          >
            <Text style={styles.toggle}>{revealed ? "Hide" : "Show"}</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { gap: 6 },
  label: { fontSize: 14, fontWeight: "500", color: lightColors.onSurface },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: lightColors.outline,
    paddingHorizontal: 12,
    backgroundColor: lightColors.surface,
  },
  inputRowError: { borderColor: lightColors.error },
  input: { flex: 1, fontSize: 15, color: lightColors.onSurface },
  toggle: { fontSize: 13, fontWeight: "600", color: lightColors.primary, marginLeft: 8 },
  error: { fontSize: 13, color: lightColors.error },
  hint: { fontSize: 13, color: lightColors.onSurfaceVariant },
});
