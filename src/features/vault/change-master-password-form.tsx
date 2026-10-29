"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { changeMasterPasswordSchema, type ChangeMasterPasswordInput } from "@/schemas/vault";
import { changeMasterPassword } from "./change-master-password";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmPasswordDialog } from "@/components/shared/confirm-password-dialog";
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

  // Validated form data waiting for the account-password confirmation.
  const [awaitingConfirm, setAwaitingConfirm] = useState<ChangeMasterPasswordInput | null>(null);

  const onSubmit = handleSubmit((data) => {
    setServerError(undefined);
    setAwaitingConfirm(data); // opens ConfirmPasswordDialog
  });

  // Runs once the account password was confirmed (5-minute re-auth window).
  function runChange() {
    const data = awaitingConfirm;
    setAwaitingConfirm(null);
    if (!data) return;
    startTransition(async () => {
      try {
        // Re-keys the vault in the browser; retries once if the vault changed meanwhile.
        const result = await changeMasterPassword(data.currentPassword, data.newPassword);
        if (!result.ok) {
          setServerError(result.error);
          return;
        }

        toast.success("Master password changed successfully.");
        reset();
      } catch {
        setServerError("An unexpected error occurred. Please try again.");
      }
    });
  }

  function toggleShow(field: ShowField) {
    setShow((prev) => ({ ...prev, [field]: !prev[field] }));
  }

  return (
    <>
      <ConfirmPasswordDialog
        open={awaitingConfirm !== null}
        onOpenChange={(open) => !open && setAwaitingConfirm(null)}
        onConfirmed={runChange}
        title="Confirm before changing your master password"
        description="Changing your master password re-encrypts your whole vault."
        confirmLabel="Continue"
      />
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
    </>
  );
}
