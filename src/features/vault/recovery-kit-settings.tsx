"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmPasswordDialog } from "@/components/shared/confirm-password-dialog";
import { useVaultUserId } from "@/providers/vault-user-provider";
import { createRecoveryKit } from "./vault-crypto";
import { RecoveryKitDisplay } from "./recovery-kit-display";

interface RecoveryKitSettingsProps {
  /** ISO date of the current recovery key, or null if the vault has none. */
  recoveryCreatedAt: string | null;
}

/** Settings → Recovery kit: create a recovery key, or replace the current one. */
export function RecoveryKitSettings({ recoveryCreatedAt }: RecoveryKitSettingsProps) {
  const router = useRouter();
  const userId = useVaultUserId();
  const [editing, setEditing] = useState(false);
  const [masterPassword, setMasterPassword] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();
  const hasKey = recoveryCreatedAt !== null;

  function create() {
    setConfirming(false);
    setError(undefined);
    startTransition(async () => {
      const result = await createRecoveryKit(masterPassword, userId);
      setMasterPassword("");
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNewKey(result.recoveryKeyText);
    });
  }

  if (newKey) {
    return (
      <RecoveryKitDisplay
        recoveryKey={newKey}
        doneLabel="Done"
        onDone={() => {
          setNewKey(null);
          setEditing(false);
          toast.success(hasKey ? "Recovery key replaced." : "Recovery key created.");
          router.refresh();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <ConfirmPasswordDialog
        open={confirming}
        onOpenChange={setConfirming}
        onConfirmed={create}
        title={hasKey ? "Replace your recovery key?" : "Create a recovery key"}
        description={
          hasKey ? "Your current recovery key will stop working." : "You'll see the key once."
        }
        confirmLabel={hasKey ? "Replace key" : "Create key"}
      />

      <p className="flex items-center gap-2 text-sm">
        <KeyRound className="text-muted-foreground size-4" aria-hidden="true" />
        {hasKey
          ? `Recovery key created ${new Date(recoveryCreatedAt).toLocaleDateString()}.`
          : "No recovery key yet. Without one, a forgotten master password means losing your vault."}
      </p>

      {error && (
        <div
          role="alert"
          className="bg-destructive/10 text-destructive flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
        >
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {!editing ? (
        <Button
          type="button"
          variant={hasKey ? "outline" : "default"}
          onClick={() => setEditing(true)}
        >
          {hasKey ? "Replace recovery key" : "Create recovery key"}
        </Button>
      ) : (
        <form
          noValidate
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (masterPassword) setConfirming(true);
          }}
        >
          <div className="space-y-1">
            <label htmlFor="recovery-master-password" className="text-sm font-medium">
              Master password
            </label>
            <Input
              id="recovery-master-password"
              type="password"
              autoComplete="current-password"
              value={masterPassword}
              onChange={(e) => setMasterPassword(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              Needed to unlock your vault key in this browser so it can be wrapped with the new
              recovery key.
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={isPending || !masterPassword}>
              {isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              Continue
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setMasterPassword("");
                setError(undefined);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
