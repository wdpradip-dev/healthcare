import { useEffect } from "react";
import { Stack, router } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { lightColors } from "@hospital/ui-tokens";
import { useAuth } from "@/lib/auth-context";

/**
 * Auth-gated route group for every authenticated screen Phase 7 adds
 * (doctor/department discovery, booking, appointment management). Mirrors
 * Splash's own bootstrap-aware redirect (app/index.tsx) so a session that
 * lapses mid-use (refresh token revoked, account deactivated) routes back to
 * Welcome instead of leaving a broken authenticated screen on-screen.
 */
export default function AppLayout() {
  const { user, isBootstrapping } = useAuth();

  useEffect(() => {
    if (!isBootstrapping && !user) {
      router.replace("/welcome");
    }
  }, [isBootstrapping, user]);

  if (isBootstrapping || !user) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color={lightColors.primary} />
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: lightColors.background },
});
