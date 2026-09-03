import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "@hospital/ui-native";
import { lightColors } from "@hospital/ui-tokens";

/** Welcome — docs/08-MOBILE-DESIGN-MOCKUPS.md "Authentication > Welcome". */
export default function Welcome() {
  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.title}>Hospital Platform</Text>
        <Text style={styles.tagline}>Book appointments. Access your records. All in one trusted app.</Text>
      </View>
      <View style={styles.actions}>
        <Button label="Create Account" variant="primary" onPress={() => router.push("/register")} />
        <Button label="Log In" variant="secondary" onPress={() => router.push("/login")} />
        <Text style={styles.legal}>By continuing you agree to our Terms &amp; Privacy Policy.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightColors.background,
    justifyContent: "space-between",
    padding: 24,
    paddingBottom: 40,
  },
  hero: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  title: { fontSize: 28, fontWeight: "700", color: lightColors.onSurface },
  tagline: { fontSize: 16, color: lightColors.onSurfaceVariant, textAlign: "center" },
  actions: { gap: 12 },
  legal: { fontSize: 12, color: lightColors.onSurfaceVariant, textAlign: "center", marginTop: 4 },
});
