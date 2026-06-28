"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resetPasswordAction } from "@/server/auth-actions";
import { resetPasswordSchema, type ResetPasswordInput } from "@/schemas/auth";
import { FieldError } from "./field-error";

interface Props {
  email: string;
  token: string;
}

export function ResetPasswordForm({ email, token }: Props) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string>();
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { email, token },
  });

  const onSubmit = handleSubmit((data) => {
    setServerError(undefined);
    startTransition(async () => {
      const result = await resetPasswordAction(data);
      if ("error" in result) setServerError(result.error);
      else {
        setSuccess(true);
        setTimeout(() => router.push("/auth/signin"), 2000);
      }
    });
  });

  if (success) {
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <ShieldCheck className="text-success size-10" aria-hidden="true" />
        <p className="font-medium">Password updated</p>
        <p className="text-muted-foreground text-sm">Redirecting you to sign in…</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <input type="hidden" {...register("email")} />
      <input type="hidden" {...register("token")} />

      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">New password</h1>
        <p className="text-muted-foreground text-sm">Choose a strong password for your account.</p>
      </div>

      {serverError && (
        <div
          role="alert"
          className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm"
        >
          {serverError}{" "}
          <Link href="/auth/forgot-password" className="underline underline-offset-2">
            Request a new link.
          </Link>
        </div>
      )}

      <div className="space-y-1">
        <label htmlFor="password" className="text-sm font-medium">
          New password
        </label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          aria-describedby="password-hint password-error"
          aria-invalid={!!errors.password}
          {...register("password")}
        />
        <p id="password-hint" className="text-muted-foreground text-xs">
          Min 12 chars, uppercase, number, and special character.
        </p>
        <FieldError id="password-error" message={errors.password?.message} />
      </div>

      <div className="space-y-1">
        <label htmlFor="confirmPassword" className="text-sm font-medium">
          Confirm new password
        </label>
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          aria-describedby={errors.confirmPassword ? "confirm-error" : undefined}
          aria-invalid={!!errors.confirmPassword}
          {...register("confirmPassword")}
        />
        <FieldError id="confirm-error" message={errors.confirmPassword?.message} />
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />}
        {isPending ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}
