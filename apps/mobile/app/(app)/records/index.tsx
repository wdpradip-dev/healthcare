import { router } from "expo-router";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { lightColors } from "@hospital/ui-tokens";
import { Button } from "@hospital/ui-native";
import { useAuth } from "@/lib/auth-context";
import { medicalRecordsApi } from "@/lib/resources";
import { RecordRow } from "@/components/record-row";

/** docs/08-MOBILE-DESIGN-MOCKUPS.md "Medical Dashboard". The "All Hospitals"
 * filter isn't shown: a patient can't resolve hospital names (no hospitals.read). */
export default function MedicalDashboard() {
  const { accessToken } = useAuth();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["medical-records", "summary"],
    queryFn: () => medicalRecordsApi.summary(accessToken!),
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
        <Text style={styles.error}>Couldn&apos;t load your records. Please try again.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Records</Text>

      {data.allergies.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Allergies</Text>
          {data.allergies.map((a) => (
            <Text key={a.id} style={a.severity === "SEVERE" ? styles.severe : styles.body}>
              {a.allergen} — {a.severity}
              {a.reaction ? ` (${a.reaction})` : ""}
            </Text>
          ))}
        </View>
      ) : null}

      {data.activeConditions.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Conditions</Text>
          {data.activeConditions.map((c) => (
            <Text key={c.id} style={styles.body}>
              {c.name} · {c.status}
            </Text>
          ))}
        </View>
      ) : null}

      <Button label={`Active prescriptions: ${data.activePrescriptionCount}`} variant="secondary" onPress={() => router.push("/prescriptions")} />
      <Button label="Lab & imaging reports" variant="secondary" onPress={() => router.push("/reports")} />

      <Text style={styles.sectionTitle}>Timeline</Text>
      {data.recentConsultations.length === 0 ? <Text style={styles.body}>No consultations yet.</Text> : null}
      {data.recentConsultations.map((entry) => (
        <RecordRow key={entry.id} entry={entry} onPress={() => router.push(`/records/consultations/${entry.id}`)} />
      ))}

      {data.consultationCount > data.recentConsultations.length ? (
        <Button label="View full history" variant="secondary" onPress={() => router.push("/records/history")} />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: lightColors.background, padding: 24, gap: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: lightColors.background, padding: 24 },
  title: { fontSize: 22, fontWeight: "700", color: lightColors.onSurface },
  card: { borderRadius: 12, borderWidth: 1, borderColor: lightColors.outline, padding: 16, gap: 4 },
  sectionTitle: { fontSize: 15, fontWeight: "600", color: lightColors.onSurface },
  body: { fontSize: 14, color: lightColors.onSurface },
  severe: { fontSize: 14, fontWeight: "700", color: lightColors.error },
  error: { fontSize: 14, color: lightColors.error, textAlign: "center" },
});
