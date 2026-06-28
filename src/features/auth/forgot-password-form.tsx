"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { forgotPasswordAction } from "@/server/auth-actions";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/schemas/auth";
import { FieldError } from "./field-error";

export function ForgotPasswordForm() {
  const [serverError, setServerError] = useState<string>();
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = handleSubmit((data) => {
    setServerError(undefined);
    startTransition(async () => {
      const result = await forgotPasswordAction(data);
      if ("error" in result) setServerError(result.error);
      else setSubmitted(true);
    });
  });

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <MailCheck className="text-success size-10" aria-hidden="true" />
        <p className="font-medium">Check your inbox</p>
        <p className="text-muted-foreground text-sm">
          If that email is registered, you&apos;ll receive a reset link shortly.
        </p>
        <Link
          href="/auth/signin"
          className="text-primary text-sm underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Forgot password</h1>
        <p className="text-muted-foreground text-sm">
          Enter your email and we&apos;ll send a reset link.
        </p>
      </div>

      {serverError && (
        <div
          role="alert"
          className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm"
        >
          {serverError}
        </div>
      )}

      <div className="space-y-1">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          aria-describedby={errors.email ? "email-error" : undefined}
          aria-invalid={!!errors.email}
          {...register("email")}
        />
        <FieldError id="email-error" message={errors.email?.message} />
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />}
        {isPending ? "Sending…" : "Send reset link"}
      </Button>

      <p className="text-muted-foreground text-center text-sm">
        <Link
          href="/auth/signin"
          className="text-primary font-medium underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
