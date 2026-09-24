import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { lightColors } from "@hospital/ui-tokens";
import { useAuth } from "@/lib/auth-context";
import { departmentsApi, doctorsApi } from "@/lib/resources";
import { DoctorCard } from "@/components/doctor-card";

/** docs/08-MOBILE-DESIGN-MOCKUPS.md "Department Details". */
export default function DepartmentDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { accessToken } = useAuth();

  const { data: department } = useQuery({
    queryKey: ["department", id],
    queryFn: () => departmentsApi.getById(accessToken!, id),
    enabled: Boolean(accessToken) && Boolean(id),
  });

  const { data: doctors, isLoading } = useQuery({
    queryKey: ["doctors", "byDepartment", id],
    queryFn: () => doctorsApi.search(accessToken!, { departmentId: id }),
    enabled: Boolean(accessToken) && Boolean(id),
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{department?.name ?? "Department"}</Text>
        {department?.description ? <Text style={styles.subtitle}>{department.description}</Text> : null}
        <Text style={styles.sectionTitle}>Doctors</Text>
      </View>

      {isLoading ? <ActivityIndicator style={styles.spinner} color={lightColors.primary} /> : null}
      {!isLoading && doctors?.length === 0 ? <Text style={styles.empty}>No doctors currently assigned to this department.</Text> : null}

      <FlatList
        data={doctors ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <DoctorCard doctor={item} onPress={() => router.push(`/doctors/${item.id}`)} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightColors.background },
  header: { padding: 16, gap: 6 },
  title: { fontSize: 20, fontWeight: "700", color: lightColors.onSurface },
  subtitle: { fontSize: 14, color: lightColors.onSurfaceVariant },
  sectionTitle: { fontSize: 15, fontWeight: "600", color: lightColors.onSurface, marginTop: 8 },
  spinner: { marginTop: 24 },
  empty: { color: lightColors.onSurfaceVariant, textAlign: "center", marginTop: 12, paddingHorizontal: 16 },
  list: { padding: 16, paddingTop: 0, gap: 12 },
});
