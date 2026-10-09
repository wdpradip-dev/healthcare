"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, FormAlert, Modal, TextField } from "@hospital/ui-web";
import { useAuth } from "@/lib/auth-provider";
import { ApiError } from "@/lib/api-client";
import { notificationsApi, type NotificationTemplateRow } from "@/lib/resources";

type Tab = "health" | "templates";

const EVENT_LABELS: Record<string, string> = {
  NEW_DEVICE_LOGIN: "New device sign-in",
  PASSWORD_CHANGED: "Password changed",
  APPOINTMENT_BOOKED: "Appointment booked",
  APPOINTMENT_RESCHEDULED: "Appointment rescheduled",
  APPOINTMENT_CANCELLED: "Appointment cancelled",
  APPOINTMENT_REMINDER: "Appointment reminder",
  CHECKED_IN: "Checked in",
  CONSULTATION_COMPLETE: "Consultation complete",
  PRESCRIPTION_ISSUED: "Prescription issued",
  REPORT_READY: "Report ready",
  STAFF_INVITED: "Staff invited",
  STAFF_DEACTIVATED: "Staff deactivated",
  REFRESH_TOKEN_REUSE: "Security alert",
};

function successRate(row: { sent: number; total: number }): string {
  return row.total === 0 ? "—" : `${Math.round((row.sent / row.total) * 100)}%`;
}

/** docs/09-ADMIN-DESIGN-MOCKUPS.md "Notifications (admin)" — Delivery Health | Templates. `notifications.manage` only. */
export default function NotificationsAdminPage() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("health");
  const [editing, setEditing] = useState<NotificationTemplateRow | null>(null);
  const [draft, setDraft] = useState({ subject: "", body: "" });
  const [error, setError] = useState<string | null>(null);

  const { data: health, isLoading: healthLoading } = useQuery({
    queryKey: ["notifications", "health"],
    queryFn: () => notificationsApi.health(accessToken!),
    enabled: Boolean(accessToken) && tab === "health",
  });
  const { data: templates, isLoading: templatesLoading } = useQuery({
    queryKey: ["notifications", "templates"],
    queryFn: () => notificationsApi.templates(accessToken!),
    enabled: Boolean(accessToken) && tab === "templates",
  });

  const save = useMutation({
    mutationFn: () => notificationsApi.upsertTemplate(accessToken!, editing!.key, { channel: editing!.channel, subject: draft.subject || undefined, body: draft.body }),
    onSuccess: () => {
      setEditing(null);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["notifications", "templates"] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Couldn't save the template."),
  });

  const openEdit = (template: NotificationTemplateRow) => {
    setEditing(template);
    setDraft({ subject: template.subject ?? "", body: template.body });
  };

  const byEvent = new Map<string, NotificationTemplateRow[]>();
  for (const t of templates ?? []) {
    byEvent.set(t.key, [...(byEvent.get(t.key) ?? []), t]);
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-on-surface">Notifications</h1>
      <div role="tablist" className="flex gap-4 border-b border-outline/30">
        {(["health", "templates"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`py-2 text-sm font-medium ${tab === t ? "border-b-2 border-primary text-primary" : "text-on-surface-variant"}`}
          >
            {t === "health" ? "Delivery Health" : "Templates"}
          </button>
        ))}
      </div>

      {tab === "health" ? (
        <section className="flex flex-col gap-2">
          {healthLoading ? <p className="text-on-surface-variant">Loading…</p> : null}
          {health && health.length === 0 ? <p className="text-on-surface-variant">No deliveries recorded yet.</p> : null}
          {health && health.length > 0 ? (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-on-surface-variant">
                  <th className="py-2">Event</th>
                  <th>Channel</th>
                  <th>Delivered</th>
                  <th>Failed</th>
                  <th>Queued</th>
                </tr>
              </thead>
              <tbody>
                {health.map((row) => (
                  <tr key={`${row.event}:${row.channel}`} className="border-t border-outline/10">
                    <td className="py-2">{EVENT_LABELS[row.event] ?? row.event}</td>
                    <td>{row.channel === "PUSH" ? "Push" : "Email"}</td>
                    <td>
                      {successRate(row)} ({row.sent}/{row.total})
                    </td>
                    <td className={row.failed > 0 ? "font-medium text-error" : undefined}>{row.failed}</td>
                    <td>{row.queued}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </section>
      ) : null}

      {tab === "templates" ? (
        <section className="flex flex-col gap-3">
          {templatesLoading ? <p className="text-on-surface-variant">Loading…</p> : null}
          {[...byEvent.entries()].map(([key, rows]) => (
            <div key={key} className="rounded border border-outline/20 p-3">
              <p className="mb-2 text-sm font-semibold text-on-surface">{EVENT_LABELS[key] ?? key}</p>
              <div className="flex flex-col gap-1">
                {rows.map((row) => (
                  <div key={row.channel} className="flex items-center justify-between text-sm">
                    <span className="text-on-surface-variant">
                      {row.channel} {row.isDefault ? "(default)" : "(customized)"}
                    </span>
                    <button type="button" className="text-primary hover:underline" onClick={() => openEdit(row)}>
                      Edit
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {editing ? (
        <Modal title={`Edit ${EVENT_LABELS[editing.key] ?? editing.key} — ${editing.channel}`} onClose={() => setEditing(null)}>
          <div className="flex flex-col gap-3">
            {error ? <FormAlert variant="error">{error}</FormAlert> : null}
            {editing.channel === "EMAIL" ? (
              <TextField label="Subject" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
            ) : null}
            <label className="flex flex-col gap-1.5 text-sm font-medium text-on-surface">
              Body
              <textarea
                className="min-h-32 rounded-sm border border-outline bg-surface p-2 text-sm text-on-surface"
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              />
            </label>
            <p className="text-xs text-on-surface-variant">Variables like {"{{doctorName}}"} are filled in automatically when the notification is sent.</p>
            <Button className="w-auto" disabled={draft.body.trim() === ""} loading={save.isPending} onClick={() => save.mutate()}>
              Save
            </Button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
