"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { otpSecretSchema, type OtpSecretInput } from "@/schemas/vault";
import { createVaultItemAction, updateVaultItemAction } from "@/server/vault-item-actions";
import { getVaultKey, generateItemId, parseTotpInput } from "@/lib/crypto";
import { sealItem } from "./item-payload";
import { useVaultUserId } from "@/providers/vault-user-provider";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/features/auth/field-error";
import { ItemDialog, ItemDialogShell } from "./item-dialog-shell";
import type { OtpSecretSecret } from "@/types/vault";

const EMPTY_VALUES: OtpSecretInput = { name: "", secret: "", issuer: "", account: "", notes: "" };

/** Turn the form into the stored secret (otpauth link or base32 key + labels). */
export function otpSecretFromInput(data: OtpSecretInput): OtpSecretSecret {
  const params = parseTotpInput(data.secret);
  return {
    secret: params.secret,
    // Typed labels win; otherwise use the ones in the otpauth:// link.
    issuer: data.issuer.trim() || params.issuer,
    account: data.account.trim() || params.account,
    algorithm: params.algorithm,
    digits: params.digits,
    period: params.period,
    notes: data.notes,
  };
}

function OtpSecretForm({
  mode,
  itemId,
  initialValues,
  onClose,
}: {
  mode: "create" | "edit";
  itemId?: string;
  initialValues?: Partial<OtpSecretInput>;
  onClose: () => void;
}) {
  const [serverError, setServerError] = useState<string>();
  const [isPending, startTransition] = useTransition();
  const userId = useVaultUserId();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<OtpSecretInput>({
    resolver: zodResolver(otpSecretSchema),
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
        const secret = otpSecretFromInput(data);
        // The id is bound into the AAD before encryption (crypto v2).
        const id = mode === "create" ? generateItemId() : itemId;
        if (!id) return;
        const { ciphertext, iv } = await sealItem(
          key,
          { id, type: "OTP_SECRET", name: data.name, secret },
          userId
        );

        const result =
          mode === "create"
            ? await createVaultItemAction({ id, type: "OTP_SECRET", ciphertext, iv })
            : await updateVaultItemAction({ id, ciphertext, iv });
        if ("error" in result && result.error) {
          setServerError(result.error);
          return;
        }
        toast.success(mode === "create" ? "Authenticator saved" : "Authenticator updated");
        onClose();
      } catch {
        toast.error("Failed to save. Please try again.");
      }
    });
  });

  return (
    <ItemDialogShell
      title={mode === "create" ? "Add authenticator" : "Edit authenticator"}
      formId="otp-form"
      onSubmit={onSubmit}
      serverError={serverError}
      isPending={isPending}
    >
      <div className="space-y-1">
        <label htmlFor="otp-name" className="text-sm font-medium">
          Name <span aria-hidden="true">*</span>
        </label>
        <Input
          id="otp-name"
          placeholder="e.g. GitHub 2FA"
          autoFocus
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? "otp-name-error" : undefined}
          {...register("name")}
        />
        <FieldError id="otp-name-error" message={errors.name?.message} />
      </div>

      <div className="space-y-1">
        <label htmlFor="otp-secret" className="text-sm font-medium">
          Setup key or otpauth:// link <span aria-hidden="true">*</span>
        </label>
        <Input
          id="otp-secret"
          placeholder="JBSW Y3DP EHPK 3PXP or otpauth://totp/…"
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
          aria-invalid={!!errors.secret}
          aria-describedby={errors.secret ? "otp-secret-error" : "otp-secret-hint"}
          {...register("secret")}
        />
        <FieldError id="otp-secret-error" message={errors.secret?.message} />
        {!errors.secret && (
          <p id="otp-secret-hint" className="text-muted-foreground text-xs">
            The key a site shows under &ldquo;can&apos;t scan the QR code?&rdquo;, or the otpauth://
            link from another authenticator.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor="otp-issuer" className="text-sm font-medium">
            Issuer
          </label>
          <Input id="otp-issuer" placeholder="e.g. GitHub" {...register("issuer")} />
          <FieldError id="otp-issuer-error" message={errors.issuer?.message} />
        </div>
        <div className="space-y-1">
          <label htmlFor="otp-account" className="text-sm font-medium">
            Account
          </label>
          <Input id="otp-account" placeholder="you@example.com" {...register("account")} />
          <FieldError id="otp-account-error" message={errors.account?.message} />
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor="otp-notes" className="text-sm font-medium">
          Notes
        </label>
        <Textarea
          id="otp-notes"
          placeholder="Optional notes"
          className="min-h-14 resize-none"
          {...register("notes")}
        />
      </div>
    </ItemDialogShell>
  );
}

interface OtpSecretDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  itemId?: string;
  initialValues?: Partial<OtpSecretInput>;
}

export function OtpSecretDialog({
  open,
  onOpenChange,
  mode,
  itemId,
  initialValues,
}: OtpSecretDialogProps) {
  return (
    <ItemDialog open={open} onOpenChange={onOpenChange}>
      {(close) => (
        <OtpSecretForm mode={mode} itemId={itemId} initialValues={initialValues} onClose={close} />
      )}
    </ItemDialog>
  );
}
