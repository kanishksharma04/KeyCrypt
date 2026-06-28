"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { changeMasterPasswordSchema, type ChangeMasterPasswordInput } from "@/schemas/vault";
import {
  getVaultKey,
  setVaultKey,
  deriveVaultKey,
  generateSalt,
  createVerificationBlob,
  verifyVaultKey,
  encryptItem,
  decryptItem,
  toBase64,
  fromBase64,
} from "@/lib/crypto";
import { getVaultMetaAction } from "@/server/vault-actions";
import {
  getAllItemsForReEncryptionAction,
  changeMasterPasswordAction,
} from "@/server/settings-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldError } from "@/features/auth/field-error";

const EMPTY: ChangeMasterPasswordInput = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

type ShowField = "current" | "new" | "confirm";

export function ChangeMasterPasswordForm() {
  const [show, setShow] = useState<Record<ShowField, boolean>>({
    current: false,
    new: false,
    confirm: false,
  });
  const [serverError, setServerError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ChangeMasterPasswordInput>({
    resolver: zodResolver(changeMasterPasswordSchema),
    defaultValues: EMPTY,
  });

  const onSubmit = handleSubmit((data) => {
    setServerError(undefined);
    startTransition(async () => {
      try {
        const oldKey = getVaultKey();
        if (!oldKey) {
          setServerError("Vault is locked. Please unlock and try again.");
          return;
        }

        // 1. Verify the current master password against the stored verification blob
        const meta = await getVaultMetaAction();
        if (!meta) {
          setServerError("Failed to load vault data.");
          return;
        }

        // deriveVaultKey expects Uint8Array — the DB stores base64
        const saltBytes = fromBase64(meta.salt);
        const currentKey = await deriveVaultKey(data.currentPassword, saltBytes);
        const isValid = await verifyVaultKey(currentKey, {
          ciphertext: meta.verificationBlob,
          iv: meta.verificationIv,
        });
        if (!isValid) {
          setServerError("Current master password is incorrect.");
          return;
        }

        // 2. Fetch all vault items (encrypted) for re-encryption
        const itemsResult = await getAllItemsForReEncryptionAction();
        if ("error" in itemsResult) {
          setServerError(itemsResult.error);
          return;
        }

        // 3. Derive new vault key from new password + fresh salt
        const newSaltBytes = generateSalt();
        const newKey = await deriveVaultKey(data.newPassword, newSaltBytes);

        // 4. Re-encrypt every vault item: decrypt with old key → encrypt with new key
        const reEncrypted = await Promise.all(
          itemsResult.map(async (item) => {
            const plaintext = await decryptItem<unknown>(oldKey, {
              ciphertext: item.ciphertext,
              iv: item.iv,
            });
            const { ciphertext, iv } = await encryptItem(newKey, plaintext);
            return { id: item.id, ciphertext, iv };
          })
        );

        // 5. Create a new verification blob signed with the new key
        const { ciphertext: newBlob, iv: newBlobIv } = await createVerificationBlob(newKey);

        // 6. Persist everything atomically: new VaultMeta + all re-encrypted items
        const result = await changeMasterPasswordAction({
          newSalt: toBase64(newSaltBytes),
          newVerificationBlob: newBlob,
          newVerificationIv: newBlobIv,
          items: reEncrypted,
        });

        if (result.error) {
          setServerError(result.error);
          return;
        }

        // 7. Swap the in-memory vault key — user stays unlocked after the change
        setVaultKey(newKey);

        toast.success("Master password changed successfully.");
        reset();
      } catch {
        setServerError("An unexpected error occurred. Please try again.");
      }
    });
  });

  function toggleShow(field: ShowField) {
    setShow((prev) => ({ ...prev, [field]: !prev[field] }));
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {serverError && (
        <div
          role="alert"
          className="bg-destructive/10 text-destructive flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm"
        >
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {serverError}
        </div>
      )}

      <div className="space-y-1">
        <label htmlFor="cmp-current" className="text-sm font-medium">
          Current master password
        </label>
        <div className="relative">
          <Input
            id="cmp-current"
            type={show.current ? "text" : "password"}
            autoComplete="current-password"
            className="pr-9"
            aria-invalid={!!errors.currentPassword}
            {...register("currentPassword")}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute top-1/2 right-1 -translate-y-1/2"
            onClick={() => toggleShow("current")}
            aria-label={show.current ? "Hide" : "Show"}
          >
            {show.current ? (
              <EyeOff className="size-3.5" aria-hidden="true" />
            ) : (
              <Eye className="size-3.5" aria-hidden="true" />
            )}
          </Button>
        </div>
        <FieldError id="cmp-current-error" message={errors.currentPassword?.message} />
      </div>

      <div className="space-y-1">
        <label htmlFor="cmp-new" className="text-sm font-medium">
          New master password <span aria-hidden="true">*</span>
        </label>
        <div className="relative">
          <Input
            id="cmp-new"
            type={show.new ? "text" : "password"}
            autoComplete="new-password"
            className="pr-9"
            aria-invalid={!!errors.newPassword}
            aria-describedby={errors.newPassword ? "cmp-new-error" : undefined}
            {...register("newPassword")}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute top-1/2 right-1 -translate-y-1/2"
            onClick={() => toggleShow("new")}
            aria-label={show.new ? "Hide" : "Show"}
          >
            {show.new ? (
              <EyeOff className="size-3.5" aria-hidden="true" />
            ) : (
              <Eye className="size-3.5" aria-hidden="true" />
            )}
          </Button>
        </div>
        <FieldError id="cmp-new-error" message={errors.newPassword?.message} />
        <p className="text-muted-foreground text-xs">
          Min 12 characters — must include uppercase, number, and symbol.
        </p>
      </div>

      <div className="space-y-1">
        <label htmlFor="cmp-confirm" className="text-sm font-medium">
          Confirm new master password
        </label>
        <div className="relative">
          <Input
            id="cmp-confirm"
            type={show.confirm ? "text" : "password"}
            autoComplete="new-password"
            className="pr-9"
            aria-invalid={!!errors.confirmPassword}
            aria-describedby={errors.confirmPassword ? "cmp-confirm-error" : undefined}
            {...register("confirmPassword")}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute top-1/2 right-1 -translate-y-1/2"
            onClick={() => toggleShow("confirm")}
            aria-label={show.confirm ? "Hide" : "Show"}
          >
            {show.confirm ? (
              <EyeOff className="size-3.5" aria-hidden="true" />
            ) : (
              <Eye className="size-3.5" aria-hidden="true" />
            )}
          </Button>
        </div>
        <FieldError id="cmp-confirm-error" message={errors.confirmPassword?.message} />
      </div>

      <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
        {isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        {isPending ? "Re-encrypting vault…" : "Change master password"}
      </Button>
    </form>
  );
}
