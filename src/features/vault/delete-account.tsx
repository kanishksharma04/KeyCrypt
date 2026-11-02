"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmPasswordDialog } from "@/components/shared/confirm-password-dialog";
import { clearVaultKey } from "@/lib/crypto";
import { deleteAccountAction } from "@/server/account-actions";

/** Settings → Danger zone. Typing the account email unlocks the button. */
export function DeleteAccount({ email }: { email: string }) {
  const [typed, setTyped] = useState("");
  const [open, setOpen] = useState(false);
  const matches = typed.trim().toLowerCase() === email.toLowerCase();

  // Runs after the account password was confirmed.
  async function deleteAccount() {
    // Drop the key first: on success the action signs out and redirects
    // without returning. Only errors come back here.
    clearVaultKey();
    const result = await deleteAccountAction({ email: typed });
    if (result?.error) {
      toast.error(result.error);
      setOpen(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm">
        This permanently deletes your account, your vault and every item in it, your recovery kit,
        two-factor settings and activity log. It can&apos;t be undone, and we can&apos;t recover
        anything afterwards.{" "}
        <a href="#export-heading" className="font-medium underline underline-offset-4">
          Export your vault first
        </a>{" "}
        if you want to keep your data.
      </p>
      <div className="space-y-1">
        <label htmlFor="delete-account-email" className="text-sm font-medium">
          Type <span className="font-mono">{email}</span> to confirm
        </label>
        <Input
          id="delete-account-email"
          type="email"
          autoComplete="off"
          spellCheck={false}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
      </div>
      <Button type="button" variant="destructive" disabled={!matches} onClick={() => setOpen(true)}>
        <Trash2 className="size-4" aria-hidden="true" />
        Delete account
      </Button>

      <ConfirmPasswordDialog
        open={open}
        onOpenChange={setOpen}
        onConfirmed={deleteAccount}
        title="Delete your account forever?"
        description="Your account, vault and all items will be deleted immediately. This can't be undone."
        confirmLabel="Delete forever"
        destructive
      />
    </div>
  );
}
