"use client";

import { useState, useTransition } from "react";
import { useForm, type RegisterOptions } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { masterPasswordSchema, type MasterPasswordInput } from "@/schemas/vault";
import { setupVaultAction } from "@/server/vault-actions";
import {
  generateSalt,
  deriveVaultKey,
  createVerificationBlob,
  setVaultKey,
  toBase64,
} from "@/lib/crypto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldError } from "@/features/auth/field-error";
import { cn } from "@/lib/utils";

function strengthScore(pw: string): 0 | 1 | 2 | 3 | 4 {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 12) s++;
  if (pw.length >= 16) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^a-zA-Z0-9]/.test(pw)) s++;
  return Math.min(s, 4) as 0 | 1 | 2 | 3 | 4;
}

const STRENGTH_LABELS = ["", "Weak", "Fair", "Good", "Strong"] as const;
const STRENGTH_BAR_COLORS = [
  "",
  "bg-destructive",
  "bg-orange-500",
  "bg-yellow-500",
  "bg-emerald-500",
] as const;

function StrengthMeter({ password }: { password: string }) {
  const score = strengthScore(password);

  return (
    <div className="space-y-1">
      <div
        className="flex gap-1"
        role="meter"
        aria-label={`Password strength: ${password ? STRENGTH_LABELS[score] : "None"}`}
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={4}
      >
        {([1, 2, 3, 4] as const).map((i) => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors duration-300",
              password && score >= i ? STRENGTH_BAR_COLORS[score] : "bg-muted"
            )}
          />
        ))}
      </div>
      <p className="text-muted-foreground min-h-[16px] text-xs">
        {password ? STRENGTH_LABELS[score] : ""}
      </p>
    </div>
  );
}

export function SetupMasterPasswordForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string>();
  const [isPending, startTransition] = useTransition();
  const [masterPassword, setMasterPassword] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<MasterPasswordInput>({
    resolver: zodResolver(masterPasswordSchema),
  });

  // Track the raw value for the strength meter without using watch(),
  // which is not compatible with React Compiler's memoization.
  const masterPasswordRegister: RegisterOptions<MasterPasswordInput, "masterPassword"> = {
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setMasterPassword(e.target.value),
  };

  const onSubmit = handleSubmit((data) => {
    setServerError(undefined);
    startTransition(async () => {
      try {
        const salt = generateSalt();
        // PBKDF2-SHA-256 at 600 k iterations: ~300 ms on a modern device.
        // This is intentional — the cost applies equally to attackers.
        const vaultKey = await deriveVaultKey(data.masterPassword, salt);
        const blob = await createVerificationBlob(vaultKey);

        const err = await setupVaultAction({
          salt: toBase64(salt),
          verificationBlob: blob.ciphertext,
          verificationIv: blob.iv,
        });

        if (err) {
          setServerError(err.error);
          return;
        }

        // Store the derived key in browser memory before navigating.
        // The key never leaves the client — the server only receives
        // the salt and verification blob.
        setVaultKey(vaultKey);
        router.push("/vault");
      } catch {
        toast.error("Vault creation failed. Please try again.");
      }
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Create your vault</h1>
        <p className="text-muted-foreground text-sm">
          Choose a master password to encrypt all your secrets.
        </p>
      </div>

      <div className="flex gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-600 dark:text-amber-400">
        <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          This password is <strong>never sent to our servers</strong>. If you lose it, your vault
          data cannot be recovered.
        </span>
      </div>

      {serverError && (
        <div
          role="alert"
          className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm"
        >
          {serverError}
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="masterPassword" className="text-sm font-medium">
          Master password
        </label>
        <Input
          id="masterPassword"
          type="password"
          autoComplete="new-password"
          placeholder="12+ chars, uppercase, number, symbol"
          aria-describedby={errors.masterPassword ? "mp-error" : undefined}
          aria-invalid={!!errors.masterPassword}
          {...register("masterPassword", masterPasswordRegister)}
        />
        <StrengthMeter password={masterPassword} />
        <FieldError id="mp-error" message={errors.masterPassword?.message} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="confirmPassword" className="text-sm font-medium">
          Confirm master password
        </label>
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          aria-describedby={errors.confirmPassword ? "cp-error" : undefined}
          aria-invalid={!!errors.confirmPassword}
          {...register("confirmPassword")}
        />
        <FieldError id="cp-error" message={errors.confirmPassword?.message} />
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        {isPending ? "Creating vault…" : "Create vault"}
      </Button>
    </form>
  );
}
