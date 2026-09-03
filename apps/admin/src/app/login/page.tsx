"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@hospital/validation";
import { AuthShell, Button, FormAlert, TextField } from "@hospital/ui-web";
import { useAuth } from "@/lib/auth-provider";
import { loginAction } from "./actions";

export default function LoginPage() {
  const router = useRouter();
  const { setSession } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (input) => {
    setFormError(null);
    const result = await loginAction(input);
    if (!result.ok) {
      setFormError(result.message);
      return;
    }
    setSession(result.accessToken, result.user);
    router.push("/");
  });

  return (
    <AuthShell title="Sign in" subtitle="Hospital Platform — Staff & Admin Console">
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {formError ? <FormAlert variant="error">{formError}</FormAlert> : null}
        <TextField
          label="Email or phone"
          autoComplete="username"
          error={errors.identifier?.message}
          {...register("identifier")}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register("password")}
        />
        <div className="text-right text-sm">
          <Link href="/forgot-password" className="text-primary hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" loading={isSubmitting}>
          Sign in
        </Button>
      </form>
    </AuthShell>
  );
}
