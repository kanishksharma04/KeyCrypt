"use client";

import type { FormEventHandler, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Shared frame for the four item dialogs (login, secure note, API key, WiFi).

interface ItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Renders the form; receives a callback that closes the dialog. */
  children: (close: () => void) => ReactNode;
}

/**
 * The dialog itself. The form is rendered only while open, so it mounts fresh
 * on every open and its state (react-hook-form, errors, toggles) always resets.
 */
export function ItemDialog({ open, onOpenChange, children }: ItemDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open && children(() => onOpenChange(false))}
      </DialogContent>
    </Dialog>
  );
}

interface ItemDialogShellProps {
  title: string;
  /** Links the footer's Save button to the form. */
  formId: string;
  onSubmit: FormEventHandler<HTMLFormElement>;
  serverError?: string;
  isPending: boolean;
  /** The form fields. */
  children: ReactNode;
}

/** Title, server error, form wrapper and Cancel/Save footer. */
export function ItemDialogShell({
  title,
  formId,
  onSubmit,
  serverError,
  isPending,
  children,
}: ItemDialogShellProps) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>

      <form id={formId} onSubmit={onSubmit} noValidate className="space-y-3">
        {serverError && (
          <div
            role="alert"
            className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm"
          >
            {serverError}
          </div>
        )}
        {children}
      </form>

      <DialogFooter>
        <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
        <Button form={formId} type="submit" size="sm" disabled={isPending}>
          {isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
          {isPending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </>
  );
}
