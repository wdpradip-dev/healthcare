import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { lightColors } from "@hospital/ui-tokens";
import { Button } from "@hospital/ui-native";
import { useAuth } from "@/lib/auth-context";

/**
 * Minimal authenticated entry point — greeting + the two Phase 7 entry
 * points (Doctor search, Appointments). This is deliberately NOT the full
 * "Patient Home" dashboard from docs/08-MOBILE-DESIGN-MOCKUPS.md (upcoming-
 * appointment card, recent reports, notification bell, bottom tab bar) —
 * that needs data this phase doesn't own (reports, notifications) and is
 * tracked separately as T-1301 (Phase 13). Log out lives here for now since
 * Profile (T-1301) doesn't exist yet.
 */
export default function Home() {
  const { user, clearSession } = useAuth();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Good day, {user?.name}</Text>

      <View style={styles.actions}>
        <Button label="Find a Doctor" onPress={() => router.push("/doctors")} />
        <Button label="Browse Departments" variant="secondary" onPress={() => router.push("/departments")} />
        <Button label="My Appointments" variant="secondary" onPress={() => router.push("/appointments")} />
      </View>

      <Button label="Log Out" variant="text" onPress={() => void clearSession()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: lightColors.background, padding: 24, gap: 24, justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "700", color: lightColors.onSurface },
  actions: { gap: 12 },
});
