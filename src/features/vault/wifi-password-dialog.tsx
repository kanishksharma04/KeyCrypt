"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { wifiPasswordSchema, WIFI_SECURITY_TYPES, type WifiPasswordInput } from "@/schemas/vault";
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
        const { ciphertext, iv } = await encryptItem(key, secret);

        if (mode === "create") {
          const result = await createVaultItemAction({
            type: "WIFI_PASSWORD",
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

        toast.success(mode === "create" ? "WiFi password saved" : "WiFi password updated");
        onClose();
      } catch {
        toast.error("Failed to save. Please try again.");
      }
    });
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{mode === "create" ? "Add WiFi password" : "Edit WiFi password"}</DialogTitle>
      </DialogHeader>

      <form id="wifi-form" onSubmit={onSubmit} noValidate className="space-y-3">
        {serverError && (
          <div
            role="alert"
            className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm"
          >
            {serverError}
          </div>
        )}

        <div className="space-y-1">
          <label htmlFor="wifi-name" className="text-sm font-medium">
            Network name <span aria-hidden="true">*</span>
          </label>
          <Input
            id="wifi-name"
            placeholder="e.g. Home WiFi"
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
      </form>

      <DialogFooter>
        <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
        <Button form="wifi-form" type="submit" size="sm" disabled={isPending}>
          {isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
          {isPending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </>
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open && (
          <WifiPasswordForm
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
