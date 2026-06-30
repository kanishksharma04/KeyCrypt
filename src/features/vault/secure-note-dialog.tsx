"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { secureNoteSchema, type SecureNoteInput } from "@/schemas/vault";
import { createVaultItemAction, updateVaultItemAction } from "@/server/vault-item-actions";
import { getVaultKey, encryptItem } from "@/lib/crypto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/features/auth/field-error";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SecureNoteSecret } from "@/types/vault";

const EMPTY_VALUES: SecureNoteInput = { name: "", content: "" };

function SecureNoteForm({
  mode,
  itemId,
  initialValues,
  onClose,
}: {
  mode: "create" | "edit";
  itemId?: string;
  initialValues?: Partial<SecureNoteInput>;
  onClose: () => void;
}) {
  const [serverError, setServerError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SecureNoteInput>({
    resolver: zodResolver(secureNoteSchema),
    defaultValues: { ...EMPTY_VALUES, ...initialValues },
  });

  const onSubmit = handleSubmit((data) => {
    setServerError(undefined);
    startTransition(async () => {
      try {
        const key = getVaultKey();
        if (!key) {
          setServerError("Vault is locked. Please unlock and try again.");
          return;
        }

        const secret: SecureNoteSecret = { content: data.content };
        const { ciphertext, iv } = await encryptItem(key, secret);

        if (mode === "create") {
          const result = await createVaultItemAction({
            type: "SECURE_NOTE",
            name: data.name,
            ciphertext,
            iv,
          });
          if ("error" in result) {
            setServerError(result.error);
            return;
          }
        } else {
          if (!itemId) return;
          const result = await updateVaultItemAction({
            id: itemId,
            name: data.name,
            ciphertext,
            iv,
          });
          if (result.error) {
            setServerError(result.error);
            return;
          }
        }

        toast.success(mode === "create" ? "Note saved" : "Note updated");
        onClose();
      } catch {
        toast.error("Failed to save. Please try again.");
      }
    });
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{mode === "create" ? "Add secure note" : "Edit secure note"}</DialogTitle>
      </DialogHeader>

      <form id="secure-note-form" onSubmit={onSubmit} noValidate className="space-y-3">
        {serverError && (
          <div
            role="alert"
            className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm"
          >
            {serverError}
          </div>
        )}

        <div className="space-y-1">
          <label htmlFor="note-name" className="text-sm font-medium">
            Title <span aria-hidden="true">*</span>
          </label>
          <Input
            id="note-name"
            placeholder="e.g. SSH key passphrase"
            autoFocus
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? "note-name-error" : undefined}
            {...register("name")}
          />
          <FieldError id="note-name-error" message={errors.name?.message} />
        </div>

        <div className="space-y-1">
          <label htmlFor="note-content" className="text-sm font-medium">
            Content
          </label>
          <Textarea
            id="note-content"
            placeholder="Secure note content…"
            className="min-h-32 resize-y"
            {...register("content")}
          />
          <FieldError id="note-content-error" message={errors.content?.message} />
        </div>
      </form>

      <DialogFooter>
        <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
        <Button form="secure-note-form" type="submit" size="sm" disabled={isPending}>
          {isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
          {isPending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </>
  );
}

interface SecureNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  itemId?: string;
  initialValues?: Partial<SecureNoteInput>;
}

export function SecureNoteDialog({
  open,
  onOpenChange,
  mode,
  itemId,
  initialValues,
}: SecureNoteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open && (
          <SecureNoteForm
            mode={mode}
            itemId={itemId}
            initialValues={initialValues}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
