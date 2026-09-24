import { router } from "expo-router";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { lightColors } from "@hospital/ui-tokens";
import { useAuth } from "@/lib/auth-context";
import { medicalRecordsApi } from "@/lib/resources";
import { RecordRow } from "@/components/record-row";

/** docs/08-MOBILE-DESIGN-MOCKUPS.md "Medical History" — the full chronological
 * list. The date-range/hospital/type filter chips are omitted for now: only one
 * record type exists until Phase 9, and hospital names aren't resolvable by a
 * patient (see the dashboard). */
export default function MedicalHistory() {
  const { accessToken } = useAuth();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["medical-records", "list"],
    queryFn: () => medicalRecordsApi.list(accessToken!),
    enabled: Boolean(accessToken),
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Medical History</Text>
      {isLoading ? <ActivityIndicator style={styles.spinner} color={lightColors.primary} /> : null}
      {isError ? <Text style={styles.error}>Couldn&apos;t load your history. Please try again.</Text> : null}
      {!isLoading && !isError && data?.length === 0 ? <Text style={styles.empty}>No records yet.</Text> : null}
      <FlatList
        data={data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <RecordRow entry={item} onPress={() => router.push(`/records/consultations/${item.id}`)} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightColors.background },
  title: { fontSize: 20, fontWeight: "700", color: lightColors.onSurface, padding: 16 },
  spinner: { marginTop: 24 },
  error: { color: lightColors.error, textAlign: "center", marginTop: 24 },
  empty: { color: lightColors.onSurfaceVariant, textAlign: "center", marginTop: 24 },
  list: { padding: 16, paddingTop: 0, gap: 12 },
});
