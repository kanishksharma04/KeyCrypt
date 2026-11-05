"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, Lock, Shield, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { unlockSchema, type UnlockInput } from "@/schemas/vault";
import { setVaultKey } from "@/lib/crypto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SignOutButton } from "@/components/shared/sign-out-button";
import { ConfirmPasswordDialog } from "@/components/shared/confirm-password-dialog";
import { FieldError } from "@/features/auth/field-error";
import type { VaultMetaForUnlock } from "@/server/vault-actions";
import { unlockVault, upgradeVaultToV2 } from "./vault-crypto";
import { RecoveryUnlock } from "./recovery-unlock";

interface UnlockFormProps {
  meta: VaultMetaForUnlock;
  /** Binds re-encrypted items to their owner during the v1 → v2 upgrade (AAD). */
  userId: string;
}

export function UnlockForm({ meta, userId }: UnlockFormProps) {
  const router = useRouter();
  const [wrongPassword, setWrongPassword] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [showPassword, setShowPassword] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [useRecovery, setUseRecovery] = useState(false);
  // A v1 vault unlocked but not yet upgraded. Held only until the upgrade
  // finishes or is cancelled; never rendered or sent anywhere. While set, the
  // upgrade confirmation dialog is open.
  const [pendingUpgrade, setPendingUpgrade] = useState<{
    masterPassword: string;
    v1Key: CryptoKey;
  } | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UnlockInput>({ resolver: zodResolver(unlockSchema) });

  const onSubmit = handleSubmit((data) => {
    setWrongPassword(false);
    setNotice(undefined);
    startTransition(async () => {
      try {
        const result = await unlockVault(data.masterPassword, meta);
        if (result.status === "wrong-password") {
          setWrongPassword(true);
          return;
        }
        if (result.status === "needs-upgrade") {
          // Unlocked vaults are always v2: upgrade first (needs the account password).
          setPendingUpgrade({ masterPassword: data.masterPassword, v1Key: result.v1Key });
          return;
        }
        setVaultKey(result.vaultKey);
        router.replace("/vault");
      } catch {
        toast.error("Unlock failed. Please try again.");
      }
    });
  });

  function runUpgrade() {
    const pending = pendingUpgrade;
    setPendingUpgrade(null); // closes the dialog
    if (!pending) return;
    startTransition(async () => {
      try {
        const result = await upgradeVaultToV2(pending.masterPassword, pending.v1Key, userId);
        if (!result.ok) {
          setNotice(result.error);
          return;
        }
        setVaultKey(result.vaultKey);
        toast.success("Vault encryption upgraded.");
        router.replace("/vault");
      } catch {
        setNotice("The upgrade failed and nothing was changed. Please try again.");
      }
    });
  }

  function onUpgradeDialogChange(open: boolean) {
    if (!open && pendingUpgrade) {
      // Cancelled: stay locked rather than open an un-upgraded vault.
      setPendingUpgrade(null);
      setNotice("Your vault needs a one-time upgrade before it can be opened.");
    }
  }

  const canRecover = meta.cryptoVersion === 2 && !!meta.recoveryWrappedKey;
  if (useRecovery && canRecover) {
    return <RecoveryUnlock meta={meta} userId={userId} onCancel={() => setUseRecovery(false)} />;
  }

  return (
    <>
      <ConfirmPasswordDialog
        open={pendingUpgrade !== null}
        onOpenChange={onUpgradeDialogChange}
        onConfirmed={runUpgrade}
        title="One-time security upgrade"
        description="Your vault is moving to a stronger encryption format. This re-encrypts every item in your browser."
        confirmLabel="Upgrade and unlock"
      />
      <form onSubmit={onSubmit} noValidate className="space-y-6">
        <div className="space-y-4">
          <div className="bg-muted/60 flex size-12 items-center justify-center rounded-xl border">
            <Lock className="text-brand size-5" aria-hidden="true" />
          </div>
          <div className="space-y-1.5">
            <h1 className="font-serif text-[1.75rem] leading-tight font-semibold tracking-tight">
              Unlock your vault
            </h1>
            <p className="text-muted-foreground text-[15px] leading-relaxed">
              Enter your master password to decrypt your vault in this browser.
            </p>
          </div>
        </div>

        {wrongPassword && (
          <div
            role="alert"
            className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm"
          >
            Incorrect master password. Please try again.
          </div>
        )}

        {notice && (
          <div
            role="status"
            className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-400"
          >
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {notice}
          </div>
        )}

        <div className="space-y-2">
          <label htmlFor="masterPassword" className="text-muted-foreground text-sm font-medium">
            Master password
          </label>
          <div className="relative">
            <Input
              id="masterPassword"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              autoFocus
              placeholder="Enter your master password"
              className="h-11 rounded-xl pr-11 text-base md:text-[15px]"
              aria-describedby={errors.masterPassword ? "mp-error" : undefined}
              aria-invalid={!!errors.masterPassword}
              {...register("masterPassword")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2 rounded p-0.5"
            >
              {showPassword ? (
                <EyeOff className="size-4" aria-hidden="true" />
              ) : (
                <Eye className="size-4" aria-hidden="true" />
              )}
            </button>
          </div>
          <FieldError id="mp-error" message={errors.masterPassword?.message} />
        </div>

        <Button
          type="submit"
          className="h-11 w-full rounded-xl text-[15px] font-semibold"
          disabled={isPending}
        >
          {isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {isPending ? "Unlocking…" : "Unlock vault"}
        </Button>

        <p className="bg-muted/50 text-muted-foreground flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-xs leading-relaxed">
          <Shield className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Decryption happens on this device. Your master password is never sent anywhere.
        </p>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
          {canRecover ? (
            <button
              type="button"
              onClick={() => setUseRecovery(true)}
              className="text-brand rounded font-medium underline-offset-4 hover:underline"
            >
              Use recovery key instead
            </button>
          ) : (
            <span />
          )}
          <SignOutButton
            label="Not you? Sign out"
            variant="link"
            className="text-muted-foreground hover:text-foreground h-auto p-0 text-sm font-normal underline underline-offset-4"
          />
        </div>
      </form>
    </>
  );
}
