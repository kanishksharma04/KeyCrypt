"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Download, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmPasswordDialog } from "@/components/shared/confirm-password-dialog";
import { copySecret, COPIED_TOAST } from "@/lib/clipboard";
import { downloadFile } from "@/lib/download";
import {
  confirmTotpSetupAction,
  disableTotpAction,
  startTotpSetupAction,
} from "@/server/two-factor-actions";

interface TwoFactorSettingsProps {
  enabled: boolean;
  backupCodesLeft: number;
  /** False when the server has no TOTP_ENCRYPTION_KEY. */
  available: boolean;
}

type Step =
  | { kind: "idle" }
  | { kind: "scan"; qrDataUrl: string; secret: string }
  | { kind: "backup-codes"; codes: string[] }
  | { kind: "disable" };

/** Settings → Two-factor sign-in (TOTP). Protects the account, not the vault. */
export function TwoFactorSettings({ enabled, backupCodesLeft, available }: TwoFactorSettingsProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [confirm, setConfirm] = useState<"enable" | "disable" | null>(null);
  const [code, setCode] = useState("");
  const [savedCodes, setSavedCodes] = useState(false);
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  function startSetup() {
    setConfirm(null);
    setError(undefined);
    startTransition(async () => {
      const result = await startTotpSetupAction();
      if ("error" in result) setError(result.error);
      else setStep({ kind: "scan", ...result });
    });
  }

  function confirmSetup(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    startTransition(async () => {
      const result = await confirmTotpSetupAction(code);
      setCode("");
      if ("error" in result) setError(result.error);
      else setStep({ kind: "backup-codes", codes: result.backupCodes });
    });
  }

  function disable() {
    setConfirm(null);
    setError(undefined);
    startTransition(async () => {
      const result = await disableTotpAction(code);
      setCode("");
      if (result.error) {
        setError(result.error);
        return;
      }
      setStep({ kind: "idle" });
      toast.success("Two-factor sign-in turned off.");
      router.refresh();
    });
  }

  const errorBox = error && (
    <div
      role="alert"
      className="bg-destructive/10 text-destructive flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
    >
      <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {error}
    </div>
  );

  const dialogs = (
    <>
      <ConfirmPasswordDialog
        open={confirm === "enable"}
        onOpenChange={(o) => !o && setConfirm(null)}
        onConfirmed={startSetup}
        title="Turn on two-factor sign-in"
        description="You'll scan a QR code with an authenticator app."
        confirmLabel="Continue"
      />
      <ConfirmPasswordDialog
        open={confirm === "disable"}
        onOpenChange={(o) => !o && setConfirm(null)}
        onConfirmed={disable}
        title="Turn off two-factor sign-in?"
        description="Signing in will only need your password again."
        confirmLabel="Turn off"
        destructive
      />
    </>
  );

  if (!available) {
    return (
      <p className="text-muted-foreground text-sm">
        Two-factor sign-in isn&apos;t configured on this server.
      </p>
    );
  }

  if (step.kind === "scan") {
    return (
      <form onSubmit={confirmSetup} noValidate className="space-y-4">
        <p className="text-sm">
          Scan this QR code with an authenticator app (1Password, Google Authenticator, Aegis, …),
          then enter the 6-digit code it shows.
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element -- data: URL, CSP allows data: images */}
        <img
          src={step.qrDataUrl}
          alt="QR code for your authenticator app"
          width={220}
          height={220}
          className="rounded-lg border bg-white p-2"
        />
        <p className="text-muted-foreground text-xs">
          Can&apos;t scan? Enter this key manually:{" "}
          <code className="text-foreground font-mono break-all" data-testid="totp-secret">
            {step.secret}
          </code>
        </p>
        {errorBox}
        <div className="space-y-1">
          <label htmlFor="totp-setup-code" className="text-sm font-medium">
            Code from your app
          </label>
          <Input
            id="totp-setup-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={isPending || code.trim().length < 6}>
            {isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            Turn on
          </Button>
          <Button type="button" variant="ghost" onClick={() => setStep({ kind: "idle" })}>
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  if (step.kind === "backup-codes") {
    const text = step.codes.join("\n");
    return (
      <div className="space-y-4">
        <p className="flex items-center gap-2 text-sm font-medium">
          <ShieldCheck className="size-4 text-green-500" aria-hidden="true" />
          Two-factor sign-in is on.
        </p>
        <p className="text-muted-foreground text-sm">
          Save these backup codes. Each works <strong>once</strong> if you lose your authenticator.
          They won&apos;t be shown again.
        </p>
        <ul
          className="bg-muted grid grid-cols-2 gap-1 rounded-lg border p-3 font-mono text-sm"
          aria-label="Backup codes"
        >
          {step.codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              void copySecret(text).then(
                () => toast.success(COPIED_TOAST),
                () => toast.error("Failed to copy to clipboard")
              )
            }
          >
            <Copy className="size-3.5" aria-hidden="true" />
            Copy
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              downloadFile(
                "keycrypt-backup-codes.txt",
                `KeyCrypt two-factor backup codes (each works once)\n\n${text}\n`,
                "text/plain"
              )
            }
          >
            <Download className="size-3.5" aria-hidden="true" />
            Download .txt
          </Button>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4"
            checked={savedCodes}
            onChange={(e) => setSavedCodes(e.target.checked)}
          />
          <span>I have saved my backup codes.</span>
        </label>
        <Button
          type="button"
          disabled={!savedCodes}
          onClick={() => {
            setStep({ kind: "idle" });
            setSavedCodes(false);
            router.refresh();
          }}
        >
          Done
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {dialogs}
      <p className="flex items-center gap-2 text-sm">
        {enabled ? (
          <>
            <ShieldCheck className="size-4 text-green-500" aria-hidden="true" />
            Two-factor sign-in is on. {backupCodesLeft} backup code
            {backupCodesLeft === 1 ? "" : "s"} left.
          </>
        ) : (
          "Two-factor sign-in is off. Turn it on to require a code from your phone when signing in."
        )}
      </p>
      {errorBox}
      {!enabled ? (
        <Button type="button" onClick={() => setConfirm("enable")} disabled={isPending}>
          {isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          Turn on two-factor sign-in
        </Button>
      ) : step.kind === "disable" ? (
        <form
          noValidate
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) setConfirm("disable");
          }}
        >
          <div className="space-y-1">
            <label htmlFor="totp-disable-code" className="text-sm font-medium">
              Code from your app (or a backup code)
            </label>
            <Input
              id="totp-disable-code"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="destructive" disabled={isPending || !code.trim()}>
              {isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              Turn off
            </Button>
            <Button type="button" variant="ghost" onClick={() => setStep({ kind: "idle" })}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button type="button" variant="outline" onClick={() => setStep({ kind: "disable" })}>
          Turn off two-factor sign-in
        </Button>
      )}
    </div>
  );
}
