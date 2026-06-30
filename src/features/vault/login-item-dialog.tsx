"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { PasswordGeneratorPopover } from "./password-generator";
import { toast } from "sonner";
import { loginItemSchema, type LoginItemInput } from "@/schemas/vault";
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
import type { LoginSecret } from "@/types/vault";

// ─── Form (mounted fresh on each dialog open) ──────────────────────────────────

const EMPTY_VALUES: LoginItemInput = {
  name: "",
  username: "",
  password: "",
  url: "",
  notes: "",
};

interface LoginItemFormProps {
  mode: "create" | "edit";
  itemId?: string;
  initialValues?: Partial<LoginItemInput>;
  onClose: () => void;
}

function LoginItemForm({ mode, itemId, initialValues, onClose }: LoginItemFormProps) {
  // State initializes fresh because LoginItemForm mounts on each dialog open
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginItemInput>({
    resolver: zodResolver(loginItemSchema),
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

        // Only non-name fields go into the encrypted blob — name is plaintext for search
        const secret: LoginSecret = {
          username: data.username,
          password: data.password,
          url: data.url,
          notes: data.notes,
        };

        const { ciphertext, iv } = await encryptItem(key, secret);

        if (mode === "create") {
          const result = await createVaultItemAction({
            type: "LOGIN",
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

        toast.success(mode === "create" ? "Login saved" : "Login updated");
        onClose();
      } catch {
        toast.error("Failed to save. Please try again.");
      }
    });
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{mode === "create" ? "Add login" : "Edit login"}</DialogTitle>
      </DialogHeader>

      <form id="login-item-form" onSubmit={onSubmit} noValidate className="space-y-3">
        {serverError && (
          <div
            role="alert"
            className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm"
          >
            {serverError}
          </div>
        )}

        <div className="space-y-1">
          <label htmlFor="item-name" className="text-sm font-medium">
            Name <span aria-hidden="true">*</span>
          </label>
          <Input
            id="item-name"
            placeholder="e.g. GitHub"
            autoFocus
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? "item-name-error" : undefined}
            {...register("name")}
          />
          <FieldError id="item-name-error" message={errors.name?.message} />
        </div>

        <div className="space-y-1">
          <label htmlFor="item-username" className="text-sm font-medium">
            Username
          </label>
          <Input
            id="item-username"
            placeholder="username or email"
            autoComplete="off"
            {...register("username")}
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="item-password" className="text-sm font-medium">
            Password
          </label>
          <div className="relative">
            <Input
              id="item-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              className="pr-16"
              {...register("password")}
            />
            <div className="absolute top-1/2 right-1 flex -translate-y-1/2 items-center gap-0.5">
              <PasswordGeneratorPopover
                onUse={(pw) => setValue("password", pw, { shouldValidate: true })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className="size-3.5" aria-hidden="true" />
                ) : (
                  <Eye className="size-3.5" aria-hidden="true" />
                )}
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor="item-url" className="text-sm font-medium">
            Website URL
          </label>
          <Input
            id="item-url"
            type="url"
            placeholder="https://example.com"
            autoComplete="off"
            {...register("url")}
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="item-notes" className="text-sm font-medium">
            Notes
          </label>
          <Textarea
            id="item-notes"
            placeholder="Optional notes"
            className="min-h-14 resize-none"
            {...register("notes")}
          />
        </div>
      </form>

      <DialogFooter>
        <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
        <Button form="login-item-form" type="submit" size="sm" disabled={isPending}>
          {isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
          {isPending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </>
  );
}

// ─── Public dialog shell ───────────────────────────────────────────────────────

interface LoginItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  itemId?: string;
  initialValues?: Partial<LoginItemInput>;
}

export function LoginItemDialog({
  open,
  onOpenChange,
  mode,
  itemId,
  initialValues,
}: LoginItemDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Conditional render ensures LoginItemForm mounts fresh on each open,
            so form state (showPassword, serverError, RHF) always resets. */}
        {open && (
          <LoginItemForm
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
