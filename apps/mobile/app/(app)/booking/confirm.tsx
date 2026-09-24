import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { lightColors } from "@hospital/ui-tokens";
import { Button, FormAlert, TextField } from "@hospital/ui-native";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { appointmentsApi, doctorsApi } from "@/lib/resources";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** docs/08-MOBILE-DESIGN-MOCKUPS.md "Booking Confirmation" — review + submit,
 * then an inline success state (kept on this same screen rather than a
 * separate route, since it's only reachable right after a successful
 * booking). */
export default function BookingConfirmation() {
  const { doctorId, departmentId, startTime } = useLocalSearchParams<{
    doctorId: string;
    departmentId: string;
    startTime: string;
    endTime: string;
  }>();
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [bookedId, setBookedId] = useState<string | null>(null);

  const { data: doctor, isLoading } = useQuery({
    queryKey: ["doctor", doctorId],
    queryFn: () => doctorsApi.getById(accessToken!, doctorId),
    enabled: Boolean(accessToken) && Boolean(doctorId),
  });

  const mutation = useMutation({
    mutationFn: () => appointmentsApi.create(accessToken!, { doctorId, departmentId, startTime, reason: reason || undefined }),
    onSuccess: (appointment) => {
      void queryClient.invalidateQueries({ queryKey: ["appointments"] });
      setBookedId(appointment.id);
    },
    onError: (error) => {
      if (error instanceof ApiError && (error.code === "APPOINTMENT_CONFLICT" || error.code === "APPOINTMENT_NOT_AVAILABLE")) {
        setFormError("This slot is no longer available. Please pick another time.");
        return;
      }
      setFormError(error instanceof ApiError ? error.message : "Something went wrong.");
    },
  });

  if (bookedId) {
    return (
      <View style={styles.successContainer}>
        <Text style={styles.successIcon}>✅</Text>
        <Text style={styles.successTitle}>Appointment Confirmed</Text>
        <Text style={styles.successSubtitle}>
          {doctor?.user.name} · {formatDateTime(startTime)}
        </Text>
        <View style={styles.successActions}>
          <Button label="View Appointment" onPress={() => router.replace(`/appointments/${bookedId}`)} />
          <Button label="Done" variant="secondary" onPress={() => router.replace("/home")} />
        </View>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={lightColors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Confirm Appointment</Text>
      {formError ? <FormAlert>{formError}</FormAlert> : null}

      <View style={styles.summary}>
        <Text style={styles.summaryLine}>{doctor?.user.name}</Text>
        <Text style={styles.summaryLineMuted}>{doctor?.doctorDepartments.find((dd) => dd.departmentId === departmentId)?.department.name}</Text>
        <Text style={styles.summaryLineMuted}>{formatDateTime(startTime)}</Text>
      </View>

      <TextField label="Reason for visit (optional)" value={reason} onChangeText={setReason} />

      {doctor?.consultationFee != null ? <Text style={styles.fee}>Consultation fee: ${doctor.consultationFee}</Text> : null}

      <Button label="Confirm Booking" onPress={() => mutation.mutate()} loading={mutation.isPending} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightColors.background, padding: 24, gap: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: lightColors.background },
  title: { fontSize: 20, fontWeight: "700", color: lightColors.onSurface },
  summary: { gap: 4 },
  summaryLine: { fontSize: 16, fontWeight: "600", color: lightColors.onSurface },
  summaryLineMuted: { fontSize: 14, color: lightColors.onSurfaceVariant },
  fee: { fontSize: 14, color: lightColors.onSurface },
  successContainer: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: lightColors.background, padding: 24, gap: 12 },
  successIcon: { fontSize: 40 },
  successTitle: { fontSize: 20, fontWeight: "700", color: lightColors.onSurface },
  successSubtitle: { fontSize: 14, color: lightColors.onSurfaceVariant, textAlign: "center" },
  successActions: { marginTop: 24, width: "100%", gap: 12 },
});
