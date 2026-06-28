"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiKeySchema, type ApiKeyInput } from "@/schemas/vault";
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
import type { ApiKeySecret } from "@/types/vault";

const EMPTY_VALUES: ApiKeyInput = { name: "", key: "", description: "", notes: "" };

function ApiKeyForm({
  mode,
  itemId,
  initialValues,
  onClose,
}: {
  mode: "create" | "edit";
  itemId?: string;
  initialValues?: Partial<ApiKeyInput>;
  onClose: () => void;
}) {
  const [showKey, setShowKey] = useState(false);
  const [serverError, setServerError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ApiKeyInput>({
    resolver: zodResolver(apiKeySchema),
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

        const secret: ApiKeySecret = {
          key: data.key,
          description: data.description,
          notes: data.notes,
        };
        const { ciphertext, iv } = await encryptItem(key, secret);

        if (mode === "create") {
          const result = await createVaultItemAction({
            type: "API_KEY",
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

        toast.success(mode === "create" ? "API key saved" : "API key updated");
        onClose();
      } catch {
        toast.error("Failed to save. Please try again.");
      }
    });
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{mode === "create" ? "Add API key" : "Edit API key"}</DialogTitle>
      </DialogHeader>

      <form id="api-key-form" onSubmit={onSubmit} noValidate className="space-y-3">
        {serverError && (
          <div
            role="alert"
            className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm"
          >
            {serverError}
          </div>
        )}

        <div className="space-y-1">
          <label htmlFor="ak-name" className="text-sm font-medium">
            Name <span aria-hidden="true">*</span>
          </label>
          <Input
            id="ak-name"
            placeholder="e.g. Stripe live key"
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? "ak-name-error" : undefined}
            {...register("name")}
          />
          <FieldError id="ak-name-error" message={errors.name?.message} />
        </div>

        <div className="space-y-1">
          <label htmlFor="ak-key" className="text-sm font-medium">
            API key
          </label>
          <div className="relative">
            <Input
              id="ak-key"
              type={showKey ? "text" : "password"}
              placeholder="sk_live_…"
              autoComplete="off"
              className="pr-9 font-mono text-xs"
              {...register("key")}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute top-1/2 right-1 -translate-y-1/2"
              onClick={() => setShowKey((v) => !v)}
              aria-label={showKey ? "Hide key" : "Show key"}
            >
              {showKey ? (
                <EyeOff className="size-3.5" aria-hidden="true" />
              ) : (
                <Eye className="size-3.5" aria-hidden="true" />
              )}
            </Button>
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor="ak-description" className="text-sm font-medium">
            Description
          </label>
          <Input
            id="ak-description"
            placeholder="What this key is used for"
            autoComplete="off"
            {...register("description")}
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="ak-notes" className="text-sm font-medium">
            Notes
          </label>
          <Textarea
            id="ak-notes"
            placeholder="Optional notes"
            className="min-h-14 resize-none"
            {...register("notes")}
          />
        </div>
      </form>

      <DialogFooter>
        <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
        <Button form="api-key-form" type="submit" size="sm" disabled={isPending}>
          {isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
          {isPending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </>
  );
}

interface ApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  itemId?: string;
  initialValues?: Partial<ApiKeyInput>;
}

export function ApiKeyDialog({
  open,
  onOpenChange,
  mode,
  itemId,
  initialValues,
}: ApiKeyDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open && (
          <ApiKeyForm
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
