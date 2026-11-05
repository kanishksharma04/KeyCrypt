"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { wifiPasswordSchema, WIFI_SECURITY_TYPES, type WifiPasswordInput } from "@/schemas/vault";
import { createVaultItemAction, updateVaultItemAction } from "@/server/vault-item-actions";
import { getVaultKey, generateItemId } from "@/lib/crypto";
import { sealItem } from "./item-payload";
import { useVaultUserId } from "@/providers/vault-user-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/features/auth/field-error";
import { ItemDialog, ItemDialogShell } from "./item-dialog-shell";
import type { WifiPasswordSecret } from "@/types/vault";

const EMPTY_VALUES: WifiPasswordInput = {
  name: "",
  ssid: "",
  password: "",
  securityType: "WPA2",
  notes: "",
};

const SELECT_CLASS =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

function WifiPasswordForm({
  mode,
  itemId,
  initialValues,
  onClose,
}: {
  mode: "create" | "edit";
  itemId?: string;
  initialValues?: Partial<WifiPasswordInput>;
  onClose: () => void;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string>();
  const [isPending, startTransition] = useTransition();
  const userId = useVaultUserId();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<WifiPasswordInput>({
    resolver: zodResolver(wifiPasswordSchema),
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

        const secret: WifiPasswordSecret = {
          ssid: data.ssid,
          password: data.password,
          securityType: data.securityType,
          notes: data.notes,
        };
        // The id exists before encryption so it can be bound into the AAD:
        // this ciphertext only decrypts as item `id` of type WIFI_PASSWORD for this user.
        const id = mode === "create" ? generateItemId() : itemId;
        if (!id) return;
        // The name is encrypted together with the secret; the server never sees it.
        const { ciphertext, iv } = await sealItem(
          key,
          { id, type: "WIFI_PASSWORD", name: data.name, secret },
          userId
        );

        if (mode === "create") {
          const result = await createVaultItemAction({
            id,
            type: "WIFI_PASSWORD",
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

        toast.success(mode === "create" ? "Wi-Fi password saved" : "Wi-Fi password updated");
        onClose();
      } catch {
        toast.error("Failed to save. Please try again.");
      }
    });
  });

  return (
    <ItemDialogShell
      title={mode === "create" ? "Add Wi-Fi password" : "Edit Wi-Fi password"}
      formId="wifi-form"
      onSubmit={onSubmit}
      serverError={serverError}
      isPending={isPending}
    >
      <div className="space-y-1">
        <label htmlFor="wifi-name" className="text-sm font-medium">
          Network name <span aria-hidden="true">*</span>
        </label>
        <Input
          id="wifi-name"
          placeholder="e.g. Home Wi-Fi"
          autoFocus
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? "wifi-name-error" : undefined}
          {...register("name")}
        />
        <FieldError id="wifi-name-error" message={errors.name?.message} />
      </div>

      <div className="space-y-1">
        <label htmlFor="wifi-ssid" className="text-sm font-medium">
          SSID
        </label>
        <Input
          id="wifi-ssid"
          placeholder="Exact network SSID"
          autoComplete="off"
          {...register("ssid")}
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="wifi-password" className="text-sm font-medium">
          Password
        </label>
        <div className="relative">
          <Input
            id="wifi-password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            className="pr-9"
            {...register("password")}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute top-1/2 right-1 -translate-y-1/2"
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

      <div className="space-y-1">
        <label htmlFor="wifi-security" className="text-sm font-medium">
          Security type
        </label>
        <select id="wifi-security" className={SELECT_CLASS} {...register("securityType")}>
          {WIFI_SECURITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t === "Open" ? "Open (no password)" : t}
            </option>
          ))}
        </select>
        <FieldError id="wifi-security-error" message={errors.securityType?.message} />
      </div>

      <div className="space-y-1">
        <label htmlFor="wifi-notes" className="text-sm font-medium">
          Notes
        </label>
        <Textarea
          id="wifi-notes"
          placeholder="Optional notes"
          className="min-h-14 resize-none"
          {...register("notes")}
        />
      </div>
    </ItemDialogShell>
  );
}

interface WifiPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  itemId?: string;
  initialValues?: Partial<WifiPasswordInput>;
}

export function WifiPasswordDialog({
  open,
  onOpenChange,
  mode,
  itemId,
  initialValues,
}: WifiPasswordDialogProps) {
  return (
    <ItemDialog open={open} onOpenChange={onOpenChange}>
      {(close) => (
        <WifiPasswordForm
          mode={mode}
          itemId={itemId}
          initialValues={initialValues}
          onClose={close}
        />
      )}
    </ItemDialog>
  );
}
