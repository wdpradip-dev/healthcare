import { useMemo, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { lightColors } from "@hospital/ui-tokens";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { appointmentsApi, schedulesApi } from "@/lib/resources";

const DAYS_AHEAD = 21;

function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function nextNDays(n: number): string[] {
  const today = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return dateOnly(d);
  });
}

function dayLabel(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/**
 * docs/08-MOBILE-DESIGN-MOCKUPS.md "Doctor Availability" / "Select Date" +
 * "Select Time" — the doc calls these "identical" components; this screen
 * covers both in one. Simplified to a scrollable day-strip (next 21 days)
 * rather than a full month calendar grid, matching the admin Calendar
 * screen's own day-view simplification.
 *
 * Doubles as the Reschedule screen (T-710, "Same as Select Date/Select Time
 * flow... submit calls PATCH /appointments/:id/reschedule") when an
 * `appointmentId` query param is present — picking a slot then reschedules
 * directly rather than routing through the new-booking Confirmation review,
 * matching the mockup's brevity for that flow.
 */
export default function DoctorAvailability() {
  const { doctorId, departmentId, appointmentId } = useLocalSearchParams<{
    doctorId: string;
    departmentId: string;
    appointmentId?: string;
  }>();
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  const dates = useMemo(() => nextNDays(DAYS_AHEAD), []);
  const [selectedDate, setSelectedDate] = useState(dates[0]!);

  const { data: availability, isLoading } = useQuery({
    queryKey: ["availability", doctorId, departmentId, dates[0], dates[dates.length - 1]],
    queryFn: () => schedulesApi.getAvailability(accessToken!, doctorId, dates[0]!, dates[dates.length - 1]!, departmentId),
    enabled: Boolean(accessToken) && Boolean(doctorId),
  });

  const rescheduleMutation = useMutation({
    mutationFn: (newStartTime: string) => appointmentsApi.reschedule(accessToken!, appointmentId!, { newStartTime }),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: ["appointments"] });
      void queryClient.invalidateQueries({ queryKey: ["appointment", updated.id] });
      router.replace(`/appointments/${updated.id}`);
    },
    onError: (error) => Alert.alert("Couldn't reschedule", error instanceof ApiError ? error.message : "Something went wrong."),
  });

  const daysByDate = new Map((availability?.days ?? []).map((d) => [d.date, d]));
  const selectedDay = daysByDate.get(selectedDate);

  const onSelectSlot = (startTime: string, endTime: string) => {
    if (appointmentId) {
      rescheduleMutation.mutate(startTime);
      return;
    }
    router.push(
      `/booking/confirm?doctorId=${doctorId}&departmentId=${departmentId}&startTime=${encodeURIComponent(startTime)}&endTime=${encodeURIComponent(endTime)}`,
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayRow}>
        {dates.map((date) => {
          const day = daysByDate.get(date);
          const disabled = availability != null && day != null && !day.hasSlots;
          return (
            <Pressable
              key={date}
              onPress={() => setSelectedDate(date)}
              disabled={disabled}
              style={[styles.dayChip, selectedDate === date && styles.dayChipSelected, disabled && styles.dayChipDisabled]}
            >
              <Text style={[styles.dayChipLabel, selectedDate === date && styles.dayChipLabelSelected]}>{dayLabel(date)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {isLoading || rescheduleMutation.isPending ? <ActivityIndicator style={styles.spinner} color={lightColors.primary} /> : null}

      {!isLoading && selectedDay && !selectedDay.hasSlots ? <Text style={styles.empty}>No slots this day — try another date.</Text> : null}

      {selectedDay && selectedDay.hasSlots ? (
        <ScrollView contentContainerStyle={styles.slotGrid}>
          {selectedDay.slots.map((slot) => (
            <Pressable
              key={slot.startTime}
              onPress={() => onSelectSlot(slot.startTime, slot.endTime)}
              disabled={rescheduleMutation.isPending}
              style={styles.slot}
            >
              <Text style={styles.slotLabel}>{timeLabel(slot.startTime)}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightColors.background },
  dayRow: { padding: 16, gap: 8 },
  dayChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: lightColors.outline },
  dayChipSelected: { backgroundColor: lightColors.primary, borderColor: lightColors.primary },
  dayChipDisabled: { opacity: 0.4 },
  dayChipLabel: { fontSize: 13, fontWeight: "600", color: lightColors.onSurface },
  dayChipLabelSelected: { color: lightColors.onPrimary },
  spinner: { marginTop: 24 },
  empty: { color: lightColors.onSurfaceVariant, textAlign: "center", marginTop: 24, paddingHorizontal: 16 },
  slotGrid: { padding: 16, flexDirection: "row", flexWrap: "wrap", gap: 10 },
  slot: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: lightColors.outline, backgroundColor: lightColors.surface },
  slotLabel: { fontSize: 14, fontWeight: "600", color: lightColors.onSurface },
});
