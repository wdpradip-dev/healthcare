import { useRef } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { lightColors } from "@hospital/ui-tokens";

const LENGTH = 6;

export interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  error?: boolean;
}

/** 6 auto-advancing digit boxes — docs/08-MOBILE-DESIGN-MOCKUPS.md "OTP Verification". */
export function OtpInput({ value, onChange, onComplete, error = false }: OtpInputProps) {
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const digits = Array.from({ length: LENGTH }, (_, i) => value[i] ?? "");

  const setDigit = (index: number, char: string) => {
    const sanitized = char.replace(/[^0-9]/g, "").slice(-1);
    const nextDigits = [...digits];
    nextDigits[index] = sanitized;
    const next = nextDigits.join("");
    onChange(next);

    if (sanitized && index < LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
    // Every element of nextDigits is either a single digit or "" (never
    // multi-char), so a 6-char join means all 6 slots are filled — no
    // separate emptiness check needed (and `next.includes("")` would be
    // wrong here regardless: every string trivially "includes" "").
    if (next.length === LENGTH) {
      onComplete?.(next);
    }
  };

  const handleKeyPress = (index: number, key: string) => {
    if (key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  return (
    <View style={styles.row}>
      {digits.map((digit, index) => (
        <TextInput
          key={index}
          ref={(el) => {
            inputRefs.current[index] = el;
          }}
          value={digit}
          onChangeText={(char) => setDigit(index, char)}
          onKeyPress={({ nativeEvent }) => handleKeyPress(index, nativeEvent.key)}
          keyboardType="number-pad"
          maxLength={1}
          style={[styles.box, error && styles.boxError]}
          accessibilityLabel={`Digit ${index + 1} of ${LENGTH}`}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  box: {
    flex: 1,
    height: 52,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: lightColors.outline,
    textAlign: "center",
    fontSize: 20,
    fontWeight: "600",
    color: lightColors.onSurface,
  },
  boxError: { borderColor: lightColors.error },
});
