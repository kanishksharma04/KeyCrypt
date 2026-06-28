"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { signOut } from "next-auth/react";
import { unlockSchema, type UnlockInput } from "@/schemas/vault";
import { fromBase64, deriveVaultKey, verifyVaultKey, setVaultKey } from "@/lib/crypto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldError } from "@/features/auth/field-error";

interface UnlockFormProps {
  salt: string;
  verificationBlob: string;
  verificationIv: string;
}

export function UnlockForm({ salt, verificationBlob, verificationIv }: UnlockFormProps) {
  const router = useRouter();
  const [wrongPassword, setWrongPassword] = useState(false);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UnlockInput>({ resolver: zodResolver(unlockSchema) });

  const onSubmit = handleSubmit((data) => {
    setWrongPassword(false);
    startTransition(async () => {
      try {
        const saltBytes = fromBase64(salt);
        const vaultKey = await deriveVaultKey(data.masterPassword, saltBytes);
        const valid = await verifyVaultKey(vaultKey, {
          ciphertext: verificationBlob,
          iv: verificationIv,
        });

        if (!valid) {
          setWrongPassword(true);
          return;
        }

        setVaultKey(vaultKey);
        router.replace("/vault");
      } catch {
        toast.error("Unlock failed. Please try again.");
      }
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Unlock your vault</h1>
        <p className="text-muted-foreground text-sm">
          Enter your master password to decrypt your secrets.
        </p>
      </div>

      {wrongPassword && (
        <div
          role="alert"
          className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm"
        >
          Incorrect master password. Please try again.
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="masterPassword" className="text-sm font-medium">
          Master password
        </label>
        <Input
          id="masterPassword"
          type="password"
          autoComplete="current-password"
          autoFocus
          aria-describedby={errors.masterPassword ? "mp-error" : undefined}
          aria-invalid={!!errors.masterPassword}
          {...register("masterPassword")}
        />
        <FieldError id="mp-error" message={errors.masterPassword?.message} />
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        {isPending ? "Unlocking…" : "Unlock vault"}
      </Button>

      <p className="text-muted-foreground text-center text-sm">
        Not you?{" "}
        <button
          type="button"
          onClick={() => void signOut({ callbackUrl: "/auth/signin" })}
          className="text-primary font-medium underline-offset-4 hover:underline"
        >
          Sign out
        </button>
      </p>
    </form>
  );
}
