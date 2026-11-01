"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { secureNoteSchema, type SecureNoteInput } from "@/schemas/vault";
import { createVaultItemAction, updateVaultItemAction } from "@/server/vault-item-actions";
import { getVaultKey, generateItemId } from "@/lib/crypto";
import { sealItem } from "./item-payload";
import { useVaultUserId } from "@/providers/vault-user-provider";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/features/auth/field-error";
import { ItemDialog, ItemDialogShell } from "./item-dialog-shell";
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
  const userId = useVaultUserId();

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
        // The id exists before encryption so it can be bound into the AAD:
        // this ciphertext only decrypts as item `id` of type SECURE_NOTE for this user.
        const id = mode === "create" ? generateItemId() : itemId;
        if (!id) return;
        // The name is encrypted together with the secret; the server never sees it.
        const { ciphertext, iv } = await sealItem(
          key,
          { id, type: "SECURE_NOTE", name: data.name, secret },
          userId
        );

        if (mode === "create") {
          const result = await createVaultItemAction({
            id,
            type: "SECURE_NOTE",
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
    <ItemDialogShell
      title={mode === "create" ? "Add secure note" : "Edit secure note"}
      formId="secure-note-form"
      onSubmit={onSubmit}
      serverError={serverError}
      isPending={isPending}
    >
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
    </ItemDialogShell>
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
    <ItemDialog open={open} onOpenChange={onOpenChange}>
      {(close) => (
        <SecureNoteForm mode={mode} itemId={itemId} initialValues={initialValues} onClose={close} />
      )}
    </ItemDialog>
  );
}
