import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { lightColors } from "@hospital/ui-tokens";
import { useAuth } from "@/lib/auth-context";
import { consultationsApi, type ConsultationDetail } from "@/lib/resources";

function vitalsLine(v: ConsultationDetail["vitals"][number]): string {
  const parts = [
    v.bloodPressureSystolic != null || v.bloodPressureDiastolic != null ? `BP ${v.bloodPressureSystolic ?? "—"}/${v.bloodPressureDiastolic ?? "—"}` : null,
    v.heartRate != null ? `HR ${v.heartRate}` : null,
    v.temperatureCelsius != null ? `Temp ${v.temperatureCelsius}°C` : null,
    v.weightKg != null ? `Wt ${v.weightKg}kg` : null,
    v.spo2 != null ? `SpO₂ ${v.spo2}%` : null,
  ];
  return parts.filter(Boolean).join(" · ");
}

/** docs/08-MOBILE-DESIGN-MOCKUPS.md "Consultation Details" — read-only. Internal
 * clinician notes never reach this screen: the API strips them for a patient.
 */
export default function ConsultationDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { accessToken } = useAuth();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["consultation", id],
    queryFn: () => consultationsApi.getById(accessToken!, id),
    enabled: Boolean(accessToken) && Boolean(id),
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
        <Text style={styles.error}>This consultation could not be found.</Text>
      </View>
    );
  }

  const date = new Date(data.appointment.startTime).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Consultation · {date}</Text>
      <Text style={styles.muted}>
        {data.doctor.user.name} · {data.appointment.department.name}
      </Text>

      {data.vitals.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Vitals</Text>
          {data.vitals.map((v) => (
            <Text key={v.id} style={styles.body}>
              {vitalsLine(v)}
            </Text>
          ))}
        </View>
      ) : null}

      {data.diagnoses.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Diagnosis</Text>
          {data.diagnoses.map((d) => (
            <Text key={d.id} style={styles.body}>
              {d.description}
              {d.icd10Code ? ` (${d.icd10Code})` : ""}
            </Text>
          ))}
        </View>
      ) : null}

      {data.clinicalNotes.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notes</Text>
          {data.clinicalNotes.map((n) => (
            <Text key={n.id} style={styles.body}>
              {n.content}
            </Text>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: lightColors.background, padding: 24, gap: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: lightColors.background, padding: 24 },
  title: { fontSize: 20, fontWeight: "700", color: lightColors.onSurface },
  muted: { fontSize: 14, color: lightColors.onSurfaceVariant },
  section: { gap: 4 },
  sectionTitle: { fontSize: 15, fontWeight: "600", color: lightColors.onSurface },
  body: { fontSize: 14, color: lightColors.onSurface },
  error: { fontSize: 14, color: lightColors.error, textAlign: "center" },
});
