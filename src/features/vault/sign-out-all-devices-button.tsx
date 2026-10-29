"use client";

import { useState, useTransition } from "react";
import { Loader2, MonitorX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { clearVaultKey } from "@/lib/crypto";
import { signOutEverywhereAction } from "@/server/settings-actions";

export function SignOutAllDevicesButton() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      // Drop the key now; the action signs this browser out and redirects.
      clearVaultKey();
      const result = await signOutEverywhereAction();
      if (result?.error) {
        toast.error(result.error);
        setOpen(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && setOpen(next)}>
      <Button type="button" variant="destructive" onClick={() => setOpen(true)}>
        <MonitorX className="size-4" aria-hidden="true" />
        Sign out of all devices
      </Button>

      <DialogContent showCloseButton={!isPending}>
        <DialogHeader>
          <DialogTitle>Sign out of all devices?</DialogTitle>
          <DialogDescription>
            Every browser signed in to your account, including this one, will be signed out within a
            minute. You will need your account password to sign in again.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" size="sm" disabled={isPending} />}>
            Cancel
          </DialogClose>
          <Button variant="destructive" size="sm" onClick={confirm} disabled={isPending}>
            {isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {isPending ? "Signing out…" : "Sign out everywhere"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
