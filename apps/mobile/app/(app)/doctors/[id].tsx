import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { lightColors } from "@hospital/ui-tokens";
import { Button } from "@hospital/ui-native";
import { useAuth } from "@/lib/auth-context";
import { doctorsApi } from "@/lib/resources";

/** docs/08-MOBILE-DESIGN-MOCKUPS.md "Doctor Profile". Hospital/branch name
 * isn't shown — `doctors.read` (PATIENT, PLATFORM scope) carries no
 * `branches.read`/`hospitals.read` grant to resolve those names from, so
 * only what the doctor response actually carries (department names) is
 * shown, rather than fabricating a hospital/branch label. */
export default function DoctorProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { accessToken } = useAuth();

  const { data: doctor, isLoading, isError } = useQuery({
    queryKey: ["doctor", id],
    queryFn: () => doctorsApi.getById(accessToken!, id),
    enabled: Boolean(accessToken) && Boolean(id),
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={lightColors.primary} />
      </View>
    );
  }

  if (isError || !doctor) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>This doctor is no longer available.</Text>
      </View>
    );
  }

  const primaryDepartment = doctor.doctorDepartments.find((dd) => dd.isPrimary) ?? doctor.doctorDepartments[0];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.name}>{doctor.user.name}</Text>
      <Text style={styles.subtitle}>{doctor.qualifications}</Text>
      {doctor.doctorDepartments.length > 0 ? (
        <Text style={styles.subtitle}>{doctor.doctorDepartments.map((dd) => dd.department.name).join(", ")}</Text>
      ) : null}

      {doctor.bio ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.body}>{doctor.bio}</Text>
        </View>
      ) : null}

      {doctor.yearsOfExperience != null ? <Text style={styles.body}>{doctor.yearsOfExperience} years of experience</Text> : null}
      {doctor.consultationFee != null ? <Text style={styles.body}>Consultation fee: ${doctor.consultationFee}</Text> : null}

      {doctor.status === "ACTIVE" && primaryDepartment ? (
        <Button
          label="Book Appointment"
          onPress={() => router.push(`/booking/${doctor.id}?departmentId=${primaryDepartment.departmentId}`)}
        />
      ) : (
        <Text style={styles.error}>This doctor is not currently accepting bookings.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: lightColors.background, padding: 24, gap: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: lightColors.background, padding: 24 },
  name: { fontSize: 22, fontWeight: "700", color: lightColors.onSurface },
  subtitle: { fontSize: 15, color: lightColors.onSurfaceVariant },
  section: { gap: 4, marginTop: 8 },
  sectionTitle: { fontSize: 15, fontWeight: "600", color: lightColors.onSurface },
  body: { fontSize: 14, color: lightColors.onSurface },
  error: { fontSize: 14, color: lightColors.error, textAlign: "center" },
});
