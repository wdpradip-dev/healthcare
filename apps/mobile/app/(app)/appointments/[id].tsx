import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Modal, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { lightColors } from "@hospital/ui-tokens";
import { Button, FormAlert, TextField } from "@hospital/ui-native";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { appointmentsApi } from "@/lib/resources";

const TERMINAL = new Set(["CANCELLED", "COMPLETED", "NO_SHOW"]);

const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: "Scheduled",
  CONFIRMED: "Confirmed",
  CHECKED_IN: "Checked In",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No Show",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * docs/08-MOBILE-DESIGN-MOCKUPS.md "Appointment Details". The mockup shows
 * Check-in/Reschedule/Cancel disabled client-side once outside the policy
 * window, but a patient session has no visibility into the hospital's actual
 * `HospitalSettings` (booking-policy) values to compute that precisely —
 * buttons stay enabled and the server's own window check surfaces as an
 * inline error instead, which is honest about what the client actually knows.
 */
export default function AppointmentDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showCheckinModal, setShowCheckinModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const { data: appointment, isLoading, isError } = useQuery({
    queryKey: ["appointment", id],
    queryFn: () => appointmentsApi.getById(accessToken!, id),
    enabled: Boolean(accessToken) && Boolean(id),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["appointment", id] });
    void queryClient.invalidateQueries({ queryKey: ["appointments"] });
  };
  const onActionError = (error: unknown) => setActionError(error instanceof ApiError ? error.message : "Something went wrong.");

  const cancelMutation = useMutation({
    mutationFn: () => appointmentsApi.cancel(accessToken!, id, { reason: cancelReason || undefined }),
    onSuccess: () => {
      setShowCancelModal(false);
      refresh();
    },
    onError: onActionError,
  });
  const checkinMutation = useMutation({
    mutationFn: () => appointmentsApi.checkin(accessToken!, id),
    onSuccess: () => {
      setShowCheckinModal(true);
      refresh();
    },
    onError: onActionError,
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={lightColors.primary} />
      </View>
    );
  }
  if (isError || !appointment) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>This appointment could not be found.</Text>
      </View>
    );
  }

  const isActive = !TERMINAL.has(appointment.status);
  const canCheckin = isActive && (appointment.status === "SCHEDULED" || appointment.status === "CONFIRMED");
  const canReschedule = isActive && appointment.status !== "CHECKED_IN" && appointment.status !== "IN_PROGRESS";

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Appointment Details</Text>
        <Text style={styles.status}>{STATUS_LABELS[appointment.status]}</Text>
      </View>

      {actionError ? <FormAlert>{actionError}</FormAlert> : null}

      <Text style={styles.line}>{appointment.doctor.user.name}</Text>
      {appointment.department?.name ? <Text style={styles.lineMuted}>{appointment.department.name}</Text> : null}
      {appointment.branch?.name ? <Text style={styles.lineMuted}>{appointment.branch.name}</Text> : null}
      <Text style={styles.lineMuted}>{formatDateTime(appointment.startTime)}</Text>
      {appointment.reason ? <Text style={styles.lineMuted}>Reason: {appointment.reason}</Text> : null}
      {appointment.queueNumber != null ? <Text style={styles.lineMuted}>Queue number: {appointment.queueNumber}</Text> : null}
      {appointment.cancelReason ? <Text style={styles.lineMuted}>Cancel reason: {appointment.cancelReason}</Text> : null}

      <View style={styles.actions}>
        {appointment.consultation?.status === "COMPLETED" ? (
          <Button label="View Consultation" variant="secondary" onPress={() => router.push(`/records/consultations/${appointment.consultation!.id}`)} />
        ) : null}
        {canCheckin ? <Button label="Check In" onPress={() => checkinMutation.mutate()} loading={checkinMutation.isPending} /> : null}
        {isActive ? (
          <View style={styles.row}>
            {canReschedule ? (
              <View style={styles.rowItem}>
                <Button
                  label="Reschedule"
                  variant="secondary"
                  onPress={() => router.push(`/booking/${appointment.doctorId}?departmentId=${appointment.departmentId}&appointmentId=${appointment.id}`)}
                />
              </View>
            ) : null}
            <View style={styles.rowItem}>
              <Button label="Cancel" variant="secondary" onPress={() => setShowCancelModal(true)} />
            </View>
          </View>
        ) : null}
      </View>

      <Modal visible={showCancelModal} transparent animationType="fade" onRequestClose={() => setShowCancelModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Cancel this appointment?</Text>
            <Text style={styles.lineMuted}>
              {formatDateTime(appointment.startTime)} with {appointment.doctor.user.name}
            </Text>
            <TextField label="Reason (optional)" value={cancelReason} onChangeText={setCancelReason} />
            <View style={styles.row}>
              <View style={styles.rowItem}>
                <Button label="Keep Appointment" variant="secondary" onPress={() => setShowCancelModal(false)} />
              </View>
              <View style={styles.rowItem}>
                <Button label="Yes, Cancel" onPress={() => cancelMutation.mutate()} loading={cancelMutation.isPending} />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showCheckinModal} transparent animationType="fade" onRequestClose={() => setShowCheckinModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>You&apos;re checked in</Text>
            {appointment.queueNumber != null ? <Text style={styles.queueText}>Queue number: {appointment.queueNumber}</Text> : null}
            <Button label="Done" onPress={() => setShowCheckinModal(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightColors.background, padding: 24, gap: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: lightColors.background, padding: 24 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  title: { fontSize: 20, fontWeight: "700", color: lightColors.onSurface },
  status: { fontSize: 13, fontWeight: "700", color: lightColors.primary },
  line: { fontSize: 16, fontWeight: "600", color: lightColors.onSurface },
  lineMuted: { fontSize: 14, color: lightColors.onSurfaceVariant },
  actions: { marginTop: 20, gap: 12 },
  row: { flexDirection: "row", gap: 12 },
  rowItem: { flex: 1 },
  error: { fontSize: 14, color: lightColors.error, textAlign: "center" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center", padding: 24 },
  modalCard: { width: "100%", borderRadius: 16, backgroundColor: lightColors.surface, padding: 24, gap: 16 },
  modalTitle: { fontSize: 17, fontWeight: "700", color: lightColors.onSurface, textAlign: "center" },
  queueText: { fontSize: 15, color: lightColors.onSurface, textAlign: "center" },
});
