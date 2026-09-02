import { useEffect } from "react";
import { router } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { lightColors } from "@hospital/ui-tokens";
import { useAuth } from "@/lib/auth-context";

/**
 * Splash — docs/08-MOBILE-DESIGN-MOCKUPS.md "Authentication > Splash". The
 * silent token check IS `AuthProvider.bootstrap()`, already running from the
 * moment the provider mounts (see app/_layout.tsx); this screen just waits
 * for it and routes. Patient Home (the authenticated destination) is built
 * starting Phase 5 — until then this shows a placeholder instead of
 * navigating into a screen that doesn't exist yet.
 */
export default function Splash() {
  const { user, isBootstrapping } = useAuth();

  useEffect(() => {
    if (isBootstrapping) return;
    if (!user) {
      router.replace("/welcome");
    }
  }, [isBootstrapping, user]);

  if (!isBootstrapping && user) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Welcome, {user.name}</Text>
        <Text style={styles.subtitle}>Patient Home is built starting Phase 5 — see docs/42-PROJECT-STATE.md.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Hospital Platform</Text>
      <Text style={styles.subtitle}>Calm. Trusted. Care.</Text>
      <ActivityIndicator style={styles.spinner} color={lightColors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: lightColors.background,
    padding: 24,
    gap: 8,
  },
  title: { fontSize: 24, fontWeight: "700", color: lightColors.onSurface },
  subtitle: { fontSize: 14, color: lightColors.onSurfaceVariant, textAlign: "center" },
  spinner: { marginTop: 16 },
});
