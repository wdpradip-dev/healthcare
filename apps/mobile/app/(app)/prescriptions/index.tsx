import { router } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { lightColors } from "@hospital/ui-tokens";
import { useAuth } from "@/lib/auth-context";
import { prescriptionsApi, type PrescriptionRow } from "@/lib/resources";

export function medicationName(item: PrescriptionRow["items"][number]): string {
  return item.medication ? [item.medication.name, item.medication.strength].filter(Boolean).join(" ") : (item.freeTextName ?? "");
}

const STATUS_LABEL = { ACTIVE: "Active", SUPERSEDED: "Replaced by a newer prescription", EXPIRED: "Expired" } as const;

/** docs/08-MOBILE-DESIGN-MOCKUPS.md "Prescription List". */
export default function PrescriptionList() {
  const { accessToken } = useAuth();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["prescriptions"],
    queryFn: () => prescriptionsApi.list(accessToken!),
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
        <Text style={styles.error}>Couldn&apos;t load your prescriptions. Please try again.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Prescriptions</Text>
      {data.length === 0 ? <Text style={styles.body}>No prescriptions yet.</Text> : null}
      {data.map((p) => (
        <Pressable key={p.id} style={styles.row} accessibilityRole="button" onPress={() => router.push(`/prescriptions/${p.id}`)}>
          <Text style={styles.rowTitle}>
            {new Date(p.issuedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })} · {p.doctor.user.name}
          </Text>
          <Text style={styles.sub}>{p.items.map(medicationName).join(", ")}</Text>
          <Text style={p.status === "ACTIVE" ? styles.active : styles.sub}>{STATUS_LABEL[p.status]}</Text>
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
  active: { fontSize: 13, fontWeight: "600", color: lightColors.primary },
  error: { fontSize: 14, color: lightColors.error, textAlign: "center" },
});
