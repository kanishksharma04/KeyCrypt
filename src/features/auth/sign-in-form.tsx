"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signInSchema, type SignInInput } from "@/schemas/auth";
import { FieldError } from "./field-error";

interface SignInFormProps {
  /** Shown above the form, e.g. after the account was deleted. */
  notice?: string;
}

export function SignInForm({ notice }: SignInFormProps = {}) {
  const [serverError, setServerError] = useState<string>();
  const [showPassword, setShowPassword] = useState(false);
  const [isPending, startTransition] = useTransition();
  // Second step when two-factor sign-in is on (the password was already accepted).
  const [needsCode, setNeedsCode] = useState(false);
  const [code, setCode] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInInput>({ resolver: zodResolver(signInSchema) });

  const onSubmit = handleSubmit((data) => {
    setServerError(undefined);
    startTransition(async () => {
      // Client-side signIn avoids the Auth.js v5 InvalidProvider error from server
      // actions. Rate limiting is enforced server-side inside authorize().
      const result = await signIn("credentials", {
        email: data.email,
        password: data.password,
        ...(needsCode && { totp: code }),
        redirect: false,
      });

      // Auth.js v5 returns ok:true + status 200 for BOTH success and failure
      // when X-Auth-Return-Redirect is set. Check result.error, not result.ok.
      if (result?.error) {
        if (result.code === "TOTP_REQUIRED") {
          setNeedsCode(true);
        } else if (result.code === "TOTP_INVALID") {
          setServerError("That code didn't work. Try again, or use a backup code.");
          setCode("");
        } else if (result.code === "RATE_LIMITED") {
          setServerError("Too many attempts. Try again in 15 minutes.");
        } else if (result.code === "EMAIL_NOT_VERIFIED") {
          setServerError("Please verify your email before signing in.");
        } else {
          setServerError("Invalid email or password.");
        }
      } else {
        // Hard navigate so the browser sends the new session cookie in the next request
        window.location.href = "/vault";
      }
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-muted-foreground text-sm">
          {needsCode
            ? "Enter the 6-digit code from your authenticator app, or a backup code."
            : "Welcome back to your vault"}
        </p>
      </div>

      {notice && !serverError && (
        <div role="status" className="bg-muted rounded-lg px-3 py-2 text-sm">
          {notice}
        </div>
      )}

      {serverError && (
        <div
          role="alert"
          className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm dark:text-red-400"
        >
          {serverError}
        </div>
      )}

      {needsCode ? (
        <div className="space-y-1">
          <label htmlFor="totp" className="text-sm font-medium">
            Two-factor code
          </label>
          <Input
            id="totp"
            inputMode="text"
            autoComplete="one-time-code"
            autoFocus
            placeholder="123456 or XXXXX-XXXXX"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
      ) : (
        <>
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

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <Link
                href="/auth/forgot-password"
                className="text-muted-foreground text-xs underline-offset-4 hover:underline focus-visible:rounded"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                className="pr-9"
                aria-describedby={errors.password ? "password-error" : undefined}
                aria-invalid={!!errors.password}
                {...register("password")}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2"
              >
                {showPassword ? (
                  <EyeOff className="size-4" aria-hidden="true" />
                ) : (
                  <Eye className="size-4" aria-hidden="true" />
                )}
              </button>
            </div>
            <FieldError id="password-error" message={errors.password?.message} />
          </div>
        </>
      )}

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />}
        {isPending ? "Signing in…" : needsCode ? "Verify" : "Sign in"}
      </Button>

      <p className="text-muted-foreground text-center text-sm">
        Don&apos;t have an account?{" "}
        <Link
          href="/auth/signup"
          className="text-primary font-medium underline-offset-4 hover:underline"
        >
          Sign up
        </Link>
      </p>
    </form>
  );
}
