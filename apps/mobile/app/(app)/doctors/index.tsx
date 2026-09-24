import { useState } from "react";
import { router } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { lightColors } from "@hospital/ui-tokens";
import { TextField } from "@hospital/ui-native";
import { useAuth } from "@/lib/auth-context";
import { departmentsApi, doctorsApi } from "@/lib/resources";
import { DoctorCard } from "@/components/doctor-card";

/** docs/08-MOBILE-DESIGN-MOCKUPS.md "Search Doctors" — cross-hospital
 * discovery (`doctors.read` is PLATFORM scope for PATIENT, docs/18-MULTI-
 * TENANCY.md), so no hospitalId filter is ever sent here. Star ratings shown
 * in the mockup have no backing field on Doctor (docs/13-DATABASE-DESIGN.md)
 * and are omitted rather than fabricated. */
export default function SearchDoctors() {
  const { accessToken } = useAuth();
  const [query, setQuery] = useState("");
  const [departmentId, setDepartmentId] = useState<string | null>(null);

  const { data: departments } = useQuery({
    queryKey: ["departments"],
    queryFn: () => departmentsApi.search(accessToken!, {}),
    enabled: Boolean(accessToken),
  });

  const {
    data: doctors,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["doctors", "search", query, departmentId],
    queryFn: () => doctorsApi.search(accessToken!, { query: query || undefined, departmentId: departmentId ?? undefined }),
    enabled: Boolean(accessToken),
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TextField label="Search doctors" placeholder="Name or specialty" value={query} onChangeText={setQuery} />
      </View>

      {departments && departments.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow} contentContainerStyle={styles.chipRowContent}>
          <Chip label="All" selected={departmentId === null} onPress={() => setDepartmentId(null)} />
          {departments.map((d) => (
            <Chip key={d.id} label={d.name} selected={departmentId === d.id} onPress={() => setDepartmentId(d.id)} />
          ))}
        </ScrollView>
      ) : null}

      {isLoading ? <ActivityIndicator style={styles.spinner} color={lightColors.primary} /> : null}
      {isError ? <Text style={styles.error}>Couldn&apos;t load doctors. Please try again.</Text> : null}
      {!isLoading && !isError && doctors?.length === 0 ? <Text style={styles.empty}>No doctors match your search.</Text> : null}

      <FlatList
        data={doctors ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <DoctorCard doctor={item} onPress={() => router.push(`/doctors/${item.id}`)} />}
      />
    </View>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
      accessibilityRole="button"
      accessibilityLabel={`Filter by ${label}`}
      accessibilityState={{ selected }}
    >
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightColors.background },
  header: { padding: 16, paddingBottom: 8 },
  chipRow: { flexGrow: 0 },
  chipRowContent: { paddingHorizontal: 16, gap: 8, paddingBottom: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: lightColors.outline },
  chipSelected: { backgroundColor: lightColors.primary, borderColor: lightColors.primary },
  chipLabel: { fontSize: 13, fontWeight: "600", color: lightColors.onSurface },
  chipLabelSelected: { color: lightColors.onPrimary },
  spinner: { marginTop: 24 },
  error: { color: lightColors.error, textAlign: "center", marginTop: 24 },
  empty: { color: lightColors.onSurfaceVariant, textAlign: "center", marginTop: 24 },
  list: { padding: 16, gap: 12 },
});
