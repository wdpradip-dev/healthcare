import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { lightColors } from "@hospital/ui-tokens";

export interface AuthScreenProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

/** Shared chrome for every unauthenticated mobile screen (back arrow, title, subtitle) — docs/08-MOBILE-DESIGN-MOCKUPS.md "Authentication". */
export function AuthScreen({ title, subtitle, onBack, children, footer }: AuthScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <View style={styles.content}>
        {onBack ? (
          <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Go back" style={styles.back}>
            <Text style={styles.backLabel}>{"<"}</Text>
          </Pressable>
        ) : null}
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        <View style={styles.body}>{children}</View>
      </View>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: lightColors.background },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 16 },
  back: { width: 40, height: 40, justifyContent: "center" },
  backLabel: { fontSize: 20, color: lightColors.onSurface },
  title: { fontSize: 22, fontWeight: "700", color: lightColors.onSurface, marginTop: 8 },
  subtitle: { fontSize: 14, color: lightColors.onSurfaceVariant, marginTop: 4 },
  body: { marginTop: 24, gap: 16 },
  footer: { paddingHorizontal: 24, paddingBottom: 24, alignItems: "center" },
});
