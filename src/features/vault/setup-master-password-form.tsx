"use client";

import { useState, useTransition } from "react";
import { useForm, type RegisterOptions } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { masterPasswordSchema, type MasterPasswordInput } from "@/schemas/vault";
import { setupVaultAction } from "@/server/vault-actions";
import { setVaultKey } from "@/lib/crypto";
import { createVaultKeys } from "./vault-crypto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldError } from "@/features/auth/field-error";
import { ConfirmPasswordDialog } from "@/components/shared/confirm-password-dialog";
import { isSameAsAccountPassword, PASSWORD_REUSE_ERROR } from "@/lib/password-reuse";
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

  if (!password) return <div className="h-7" />;

  return (
    <div className="space-y-1">
      <div
        className="flex gap-1"
        role="meter"
        aria-label={`Password strength: ${STRENGTH_LABELS[score]}`}
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={4}
      >
        {([1, 2, 3, 4] as const).map((i) => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors duration-300",
              score >= i ? STRENGTH_BAR_COLORS[score] : "bg-muted"
            )}
          />
        ))}
      </div>
      <p className="text-muted-foreground text-xs">{STRENGTH_LABELS[score]}</p>
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

  // Validated form data waiting for the account-password confirmation.
  const [awaitingConfirm, setAwaitingConfirm] = useState<MasterPasswordInput | null>(null);

  const onSubmit = handleSubmit((data) => {
    setServerError(undefined);
    setAwaitingConfirm(data); // opens ConfirmPasswordDialog
  });

  // Runs once the server has verified the account password.
  function createVault(accountPassword: string) {
    const data = awaitingConfirm;
    setAwaitingConfirm(null);
    if (!data) return;
    // Browser-only comparison: the master password is never sent for this check.
    if (isSameAsAccountPassword(data.masterPassword, accountPassword)) {
      setServerError(PASSWORD_REUSE_ERROR);
      return;
    }
    startTransition(async () => {
      try {
        // Crypto v2: a random vault key, wrapped under a key derived from the
        // master password. The server only receives the salt, the wrapped key
        // and the verification blob.
        const { vaultKey, setup } = await createVaultKeys(data.masterPassword);

        const err = await setupVaultAction(setup);
        if (err) {
          setServerError(err.error);
          return;
        }

        // Keep the (non-extractable) vault key in browser memory only.
        setVaultKey(vaultKey);
        router.push("/vault");
      } catch {
        toast.error("Vault creation failed. Please try again.");
      }
    });
  }

  return (
    <>
      <ConfirmPasswordDialog
        open={awaitingConfirm !== null}
        onOpenChange={(open) => !open && setAwaitingConfirm(null)}
        onConfirmed={createVault}
        title="Confirm your account password"
        description="We check, in your browser only, that your new master password is different from it."
        confirmLabel="Create vault"
      />
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

        <p className="text-muted-foreground text-sm">
          It must be different from your account password. Your account password is sent to our
          server each time you sign in, so reusing it would let the server unlock your vault.
        </p>

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
    </>
  );
}
