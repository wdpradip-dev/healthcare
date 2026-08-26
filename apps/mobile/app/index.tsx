import { StyleSheet, Text, View } from "react-native";

/**
 * Placeholder root screen — Phase 1 scaffold. The real entry point is Splash
 * (docs/08-MOBILE-DESIGN-MOCKUPS.md), added in Phase 13 (task T-1301), or earlier
 * incrementally alongside auth (Phase 3, task T-311).
 */
export default function Index() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Hospital Platform</Text>
      <Text style={styles.subtitle}>Scaffold in progress — see docs/42-PROJECT-STATE.md.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FBFDFB",
    padding: 24,
    gap: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#191C1B",
  },
  subtitle: {
    fontSize: 14,
    color: "#404944",
    textAlign: "center",
  },
});
