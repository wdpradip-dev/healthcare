import { router } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { lightColors } from "@hospital/ui-tokens";
import { useAuth } from "@/lib/auth-context";
import { reportsApi } from "@/lib/resources";

/** docs/08-MOBILE-DESIGN-MOCKUPS.md "Lab / Diagnostic Reports". The API only ever returns released reports. */
export default function ReportList() {
  const { accessToken } = useAuth();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["reports"],
    queryFn: () => reportsApi.list(accessToken!),
    enabled: Boolean(accessToken),
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={lightColors.primary} />
      </View>
    );
  }
  if (isError || !data) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Couldn&apos;t load your reports. Please try again.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Reports</Text>
      {data.length === 0 ? <Text style={styles.body}>No reports available yet. New results appear here once your doctor has reviewed them.</Text> : null}
      {data.map((r) => (
        <Pressable key={r.id} style={styles.row} accessibilityRole="button" onPress={() => router.push(`/reports/${r.id}`)}>
          <Text style={styles.rowTitle}>{r.title}</Text>
          <Text style={styles.sub}>
            {r.type === "lab" ? "Lab" : "Imaging"}
            {r.releasedAt ? ` · ${new Date(r.releasedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}` : ""}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: lightColors.background, padding: 24, gap: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: lightColors.background, padding: 24 },
  title: { fontSize: 22, fontWeight: "700", color: lightColors.onSurface },
  body: { fontSize: 14, color: lightColors.onSurface },
  row: { borderRadius: 12, borderWidth: 1, borderColor: lightColors.outline, padding: 14, gap: 2, backgroundColor: lightColors.surface },
  rowTitle: { fontSize: 14, fontWeight: "600", color: lightColors.onSurface },
  sub: { fontSize: 13, color: lightColors.onSurfaceVariant },
  error: { fontSize: 14, color: lightColors.error, textAlign: "center" },
});
