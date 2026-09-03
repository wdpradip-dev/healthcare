"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { inviteUserSchema, type InviteUserInput } from "@hospital/validation";
import { Button, FormAlert, Modal, SelectField, TextField } from "@hospital/ui-web";
import { useAuth } from "@/lib/auth-provider";
import { useHospitalScope } from "@/lib/hospital-scope";
import { ApiError } from "@/lib/api-client";
import { usersApi } from "@/lib/resources";

/** docs/09-ADMIN-DESIGN-MOCKUPS.md "Users". */
export default function UsersPage() {
  const { accessToken } = useAuth();
  const { selectedHospitalId } = useHospitalScope();
  const queryClient = useQueryClient();
  const [isInviteOpen, setIsInviteOpen] = useState(false);

  const { data: users, isLoading, isError } = useQuery({
    queryKey: ["users", selectedHospitalId],
    queryFn: () => usersApi.list(accessToken!, selectedHospitalId),
    enabled: Boolean(accessToken),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => usersApi.deactivate(accessToken!, id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["users"] }),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-on-surface">Users</h1>
        <Button className="w-auto" onClick={() => setIsInviteOpen(true)}>
          + Invite User
        </Button>
      </div>

      {isLoading ? <p className="text-on-surface-variant">Loading…</p> : null}
      {isError ? <FormAlert variant="error">Couldn&apos;t load users. Please try again.</FormAlert> : null}
      {!isLoading && !isError && users?.length === 0 ? (
        <p className="text-on-surface-variant">No staff invited yet.</p>
      ) : null}

      {users && users.length > 0 ? (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-outline/30 text-on-surface-variant">
              <th className="py-2 pr-4 font-medium">Name</th>
              <th className="py-2 pr-4 font-medium">Email</th>
              <th className="py-2 pr-4 font-medium">Roles</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 pr-4 font-medium" />
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-outline/10">
                <td className="py-2 pr-4 text-on-surface">{user.name}</td>
                <td className="py-2 pr-4 text-on-surface-variant">{user.email ?? user.phone}</td>
                <td className="py-2 pr-4 text-on-surface-variant">
                  {user.userRoles.map((ur) => ur.role.key).join(", ")}
                </td>
                <td className="py-2 pr-4 text-on-surface-variant">{user.status}</td>
                <td className="py-2 pr-4 text-right">
                  {user.status !== "DISABLED" ? (
                    <button
                      type="button"
                      onClick={() => deactivateMutation.mutate(user.id)}
                      className="text-sm font-medium text-error hover:underline"
                    >
                      Deactivate
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {isInviteOpen ? (
        <InviteUserModal
          hospitalId={selectedHospitalId}
          onClose={() => setIsInviteOpen(false)}
          onInvited={() => {
            setIsInviteOpen(false);
            void queryClient.invalidateQueries({ queryKey: ["users"] });
          }}
        />
      ) : null}
    </div>
  );
}

function InviteUserModal({
  hospitalId,
  onClose,
  onInvited,
}: {
  hospitalId: string | null;
  onClose: () => void;
  onInvited: () => void;
}) {
  const { accessToken } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<InviteUserInput>({ resolver: zodResolver(inviteUserSchema), defaultValues: { roleKey: "NURSE" } });

  const mutation = useMutation({
    mutationFn: (input: InviteUserInput) =>
      usersApi.invite(accessToken!, hospitalId ? { ...input, hospitalId } : input),
    onSuccess: onInvited,
    onError: (error) => setFormError(error instanceof ApiError ? error.message : "Something went wrong."),
  });

  return (
    <Modal title="Invite User" onClose={onClose}>
      <form onSubmit={handleSubmit((input) => mutation.mutate(input))} className="flex flex-col gap-4" noValidate>
        {formError ? <FormAlert variant="error">{formError}</FormAlert> : null}
        <TextField label="Full name" error={errors.name?.message} {...register("name")} />
        <TextField label="Email" error={errors.email?.message} {...register("email")} />
        <SelectField label="Role" error={errors.roleKey?.message} {...register("roleKey")}>
          <option value="NURSE">Nurse</option>
          <option value="RECEPTIONIST">Receptionist</option>
          <option value="DOCTOR">Doctor</option>
          <option value="ADMIN">Admin</option>
        </SelectField>
        <Button type="submit" loading={isSubmitting || mutation.isPending}>
          Send Invite
        </Button>
      </form>
    </Modal>
  );
}
