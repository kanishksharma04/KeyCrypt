"use client";

import { useState } from "react";
import { MonitorX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmPasswordDialog } from "@/components/shared/confirm-password-dialog";
import { clearVaultKey } from "@/lib/crypto";
import { signOutEverywhereAction } from "@/server/settings-actions";
import { clearOfflineVault } from "./offline-cache";

export function SignOutAllDevicesButton() {
  const [open, setOpen] = useState(false);

  // Runs after the account password was confirmed (the confirmation step).
  async function signOutEverywhere() {
    // Drop the key now; the action signs this browser out and redirects.
    clearVaultKey();
    await clearOfflineVault(); // the encrypted offline copy on this device
    const result = await signOutEverywhereAction();
    if (result?.error) {
      toast.error(result.error);
      setOpen(false);
    }
  }

  return (
    <>
      <Button type="button" variant="destructive" onClick={() => setOpen(true)}>
        <MonitorX className="size-4" aria-hidden="true" />
        Sign out of all devices
      </Button>

      <ConfirmPasswordDialog
        open={open}
        onOpenChange={setOpen}
        onConfirmed={signOutEverywhere}
        title="Sign out of all devices?"
        description="Every browser signed in to your account, including this one, will be signed out within a minute."
        confirmLabel="Sign out everywhere"
        destructive
      />
    </>
  );
}
