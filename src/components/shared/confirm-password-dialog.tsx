"use client";

import { useState, useTransition } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { confirmAccountPasswordAction } from "@/server/reauth-actions";

interface ConfirmPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Called after the server accepted the password and set the 5-minute re-auth
   * cookie. Receives the (verified) account password so callers can compare it
   * in the browser, e.g. against a new master password. Never send it anywhere.
   */
  onConfirmed: (accountPassword: string) => void | Promise<void>;
  title?: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
}

/**
 * Asks for the ACCOUNT (sign-in) password before a destructive action.
 * On success the server grants a 5-minute re-auth window (src/lib/reauth.ts),
 * then `onConfirmed` runs the protected action.
 */
export function ConfirmPasswordDialog({
  open,
  onOpenChange,
  onConfirmed,
  title = "Confirm it's you",
  description,
  confirmLabel = "Confirm",
  destructive = false,
}: ConfirmPasswordDialogProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  function close(next: boolean) {
    if (isPending) return;
    if (!next) {
      setPassword("");
      setError(undefined);
    }
    onOpenChange(next);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    // React events bubble through portals: don't let this submit reach a parent form.
    e.stopPropagation();
    setError(undefined);
    startTransition(async () => {
      const result = await confirmAccountPasswordAction(password);
      if (result.error) {
        setError(result.error);
        return;
      }
      const confirmed = password;
      setPassword("");
      await onConfirmed(confirmed);
    });
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent showCloseButton={!isPending}>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {description ?? "This action needs your account password."} Enter the password you
              sign in with (not your master password).
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div
              role="alert"
              className="bg-destructive/10 text-destructive flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
            >
              <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {error}
            </div>
          )}

          <div className="space-y-1">
            <label htmlFor="confirm-account-password" className="text-sm font-medium">
              Account password
            </label>
            <Input
              id="confirm-account-password"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isPending}
              aria-invalid={!!error}
            />
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" disabled={isPending} />}>
              Cancel
            </DialogClose>
            <Button
              type="submit"
              size="sm"
              variant={destructive ? "destructive" : "default"}
              disabled={isPending || password.length === 0}
            >
              {isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
