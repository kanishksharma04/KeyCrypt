"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { setVaultKey } from "@/lib/crypto";
import { isSameAsAccountPassword, PASSWORD_REUSE_ERROR } from "@/lib/password-reuse";
import { masterPasswordSchema, type MasterPasswordInput } from "@/schemas/vault";
import type { VaultMetaForUnlock } from "@/server/vault-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmPasswordDialog } from "@/components/shared/confirm-password-dialog";
import { FieldError } from "@/features/auth/field-error";
import { checkRecoveryKey, resetMasterPasswordWithRecoveryKey } from "./vault-crypto";

interface RecoveryUnlockProps {
  meta: VaultMetaForUnlock;
  userId: string;
  onCancel: () => void;
}

/**
 * Forgotten master password: unlock with the recovery key, then set a new
 * master password (which re-wraps the vault key). Everything is done in the
 * browser; the server only stores the new wrapped key, after a fresh
 * account-password confirmation.
 */
export function RecoveryUnlock({ meta, userId, onCancel }: RecoveryUnlockProps) {
  const router = useRouter();
  const [recoveryKey, setRecoveryKey] = useState("");
  const [keyAccepted, setKeyAccepted] = useState(false);
  const [error, setError] = useState<string>();
  const [awaitingConfirm, setAwaitingConfirm] = useState<MasterPasswordInput | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<MasterPasswordInput>({ resolver: zodResolver(masterPasswordSchema) });

  function submitKey(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    startTransition(async () => {
      const result = await checkRecoveryKey(recoveryKey, meta, userId);
      if (!result.ok) setError(result.error);
      else setKeyAccepted(true);
    });
  }

  const submitNewPassword = handleSubmit((data) => {
    setError(undefined);
    setAwaitingConfirm(data); // opens ConfirmPasswordDialog
  });

  function reset(accountPassword: string) {
    const data = awaitingConfirm;
    setAwaitingConfirm(null);
    if (!data) return;
    // Browser-only comparison: the master password is never sent for this check.
    if (isSameAsAccountPassword(data.masterPassword, accountPassword)) {
      setError(PASSWORD_REUSE_ERROR);
      return;
    }
    startTransition(async () => {
      try {
        const result = await resetMasterPasswordWithRecoveryKey(
          recoveryKey,
          data.masterPassword,
          meta,
          userId
        );
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setVaultKey(result.vaultKey);
        toast.success("New master password set. Your recovery key still works.");
        router.replace("/vault");
      } catch {
        setError("Recovery failed and nothing was changed. Please try again.");
      }
    });
  }

  return (
    <div className="space-y-5">
      <ConfirmPasswordDialog
        open={awaitingConfirm !== null}
        onOpenChange={(open) => !open && setAwaitingConfirm(null)}
        onConfirmed={reset}
        title="Confirm your account password"
        description="Setting a new master password replaces the old one on every device."
        confirmLabel="Set new master password"
      />

      <div className="space-y-1">
        <h1 className="flex items-center gap-2 font-serif text-2xl font-semibold tracking-tight">
          <KeyRound className="text-primary size-6" aria-hidden="true" />
          Use recovery key
        </h1>
        <p className="text-muted-foreground text-sm">
          {keyAccepted
            ? "Recovery key accepted. Choose a new master password."
            : "Enter the recovery key you saved when you created your vault."}
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm"
        >
          {error}
        </div>
      )}

      {!keyAccepted ? (
        <form onSubmit={submitKey} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="recovery-key" className="text-sm font-medium">
              Recovery key
            </label>
            <Input
              id="recovery-key"
              autoComplete="off"
              autoFocus
              spellCheck={false}
              placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XX"
              className="font-mono"
              value={recoveryKey}
              onChange={(e) => setRecoveryKey(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={isPending || !recoveryKey.trim()}>
            {isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            Continue
          </Button>
        </form>
      ) : (
        <form onSubmit={submitNewPassword} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="newMasterPassword" className="text-sm font-medium">
              New master password
            </label>
            <Input
              id="newMasterPassword"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.masterPassword}
              {...register("masterPassword")}
            />
            <FieldError id="nmp-error" message={errors.masterPassword?.message} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="confirmNewMasterPassword" className="text-sm font-medium">
              Confirm new master password
            </label>
            <Input
              id="confirmNewMasterPassword"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.confirmPassword}
              {...register("confirmPassword")}
            />
            <FieldError id="cnmp-error" message={errors.confirmPassword?.message} />
          </div>
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {isPending ? "Saving…" : "Set new master password"}
          </Button>
        </form>
      )}

      <button
        type="button"
        onClick={onCancel}
        className="text-muted-foreground hover:text-foreground w-full text-center text-sm"
      >
        Back to master password
      </button>
    </div>
  );
}
