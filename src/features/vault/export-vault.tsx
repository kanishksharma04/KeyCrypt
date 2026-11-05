"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Download, FileWarning, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { encryptExport, getVaultKey } from "@/lib/crypto";
import { downloadFile } from "@/lib/download";
import {
  buildExportPayload,
  exportFilename,
  toBitwardenCsv,
  type ExportFormat,
} from "@/lib/vault-export";
import { exportPasswordSchema, type ExportPasswordInput } from "@/schemas/vault";
import { getVaultItemsForExportAction, recordVaultExportAction } from "@/server/export-actions";
import { getFoldersAction } from "@/server/folder-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmPasswordDialog } from "@/components/shared/confirm-password-dialog";
import { FieldError } from "@/features/auth/field-error";
import type { DecryptedVaultItem } from "@/types/vault";
import { decryptVaultItem } from "./use-decrypted-items";
import { openFolderName } from "./folder-payload";
import { useVaultUserId } from "@/providers/vault-user-provider";

/**
 * Fetch every item and folder and decrypt them in the browser. Fails if any
 * can't be read: an export is never silently incomplete.
 */
async function loadDecryptedVault(
  userId: string
): Promise<{ items: DecryptedVaultItem[]; folders: Map<string, string> }> {
  const key = getVaultKey();
  if (!key) throw new Error("Vault is locked. Unlock it and try again.");

  const [rows, folderRows] = await Promise.all([
    getVaultItemsForExportAction(),
    getFoldersAction(),
  ]);
  if ("error" in rows) throw new Error(rows.error);
  if ("error" in folderRows) throw new Error(folderRows.error);

  let items: DecryptedVaultItem[];
  try {
    items = await Promise.all(rows.map((row) => decryptVaultItem(key, row, userId)));
  } catch {
    throw new Error("Some items could not be decrypted, so nothing was exported.");
  }
  try {
    const names = await Promise.all(
      folderRows.map(async (row) => [row.id, await openFolderName(key, row, userId)] as const)
    );
    return { items, folders: new Map(names) };
  } catch {
    throw new Error("Some folder names could not be decrypted, so nothing was exported.");
  }
}

async function recordExport(format: ExportFormat) {
  const result = await recordVaultExportAction(format);
  if (result.error) throw new Error(result.error);
}

export function ExportVault() {
  const userId = useVaultUserId();
  const [error, setError] = useState<string>();
  const [confirmCsv, setConfirmCsv] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [pendingFormat, setPendingFormat] = useState<ExportFormat | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ExportPasswordInput>({
    resolver: zodResolver(exportPasswordSchema),
    defaultValues: { exportPassword: "", confirmExportPassword: "" },
  });

  function run(format: ExportFormat, work: () => Promise<void>) {
    setError(undefined);
    setPendingFormat(format);
    startTransition(async () => {
      try {
        await work();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Export failed. Please try again.");
      } finally {
        setPendingFormat(null);
      }
    });
  }

  const exportEncrypted = handleSubmit(({ exportPassword }) =>
    run("encrypted-json", async () => {
      const { items, folders } = await loadDecryptedVault(userId);
      // PBKDF2 (600k) + AES-256-GCM under the export password, with a fresh salt.
      const file = await encryptExport(buildExportPayload(items, folders), exportPassword);
      await recordExport("encrypted-json");
      downloadFile(
        exportFilename("encrypted-json"),
        JSON.stringify(file, null, 2),
        "application/json"
      );
      reset();
      toast.success(`Encrypted export of ${items.length} items downloaded.`);
    })
  );

  // Runs after the account password was confirmed (re-auth window).
  function exportCsv() {
    setConfirmCsv(false);
    run("csv", async () => {
      await recordExport("csv"); // server requires the recent confirmation
      const { items, folders } = await loadDecryptedVault(userId);
      downloadFile(exportFilename("csv"), toBitwardenCsv(items, folders), "text/csv;charset=utf-8");
      toast.success(`Unencrypted CSV of ${items.length} items downloaded.`);
    });
  }

  return (
    <div className="space-y-6">
      {error && (
        <div
          role="alert"
          className="bg-destructive/10 text-destructive flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm"
        >
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {/* Encrypted JSON (recommended) */}
      <form onSubmit={exportEncrypted} noValidate className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Encrypted export (recommended)</h3>
          <p className="text-muted-foreground text-sm">
            Decrypts your vault in this browser, then locks the whole file with an export password.
            Keep that password safe: without it the file cannot be opened.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="export-password" className="text-sm font-medium">
              Export password
            </label>
            <Input
              id="export-password"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.exportPassword}
              {...register("exportPassword")}
            />
            <FieldError id="export-password-error" message={errors.exportPassword?.message} />
          </div>
          <div className="space-y-1">
            <label htmlFor="export-password-confirm" className="text-sm font-medium">
              Confirm export password
            </label>
            <Input
              id="export-password-confirm"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.confirmExportPassword}
              {...register("confirmExportPassword")}
            />
            <FieldError
              id="export-password-confirm-error"
              message={errors.confirmExportPassword?.message}
            />
          </div>
        </div>
        <Button type="submit" disabled={isPending}>
          {pendingFormat === "encrypted-json" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="size-4" aria-hidden="true" />
          )}
          Download encrypted export
        </Button>
      </form>

      {/* Plain CSV */}
      <div className="space-y-3 border-t pt-6">
        <div>
          <h3 className="text-sm font-semibold">Unencrypted CSV</h3>
          <p className="text-muted-foreground text-sm">
            For moving to another password manager (Bitwarden column format).
          </p>
        </div>
        <div className="flex gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
          <FileWarning className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            This file contains <strong>every password and note in plain text</strong>. Anyone who
            gets it can read your whole vault. Import it right away, then delete it, and empty the
            trash.
          </span>
        </div>
        <Button
          type="button"
          variant="destructive"
          disabled={isPending}
          onClick={() => setConfirmCsv(true)}
        >
          {pendingFormat === "csv" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="size-4" aria-hidden="true" />
          )}
          Export unencrypted CSV
        </Button>
      </div>

      <ConfirmPasswordDialog
        open={confirmCsv}
        onOpenChange={setConfirmCsv}
        onConfirmed={exportCsv}
        title="Export your vault as plain text?"
        description="The CSV file will contain every secret unencrypted."
        confirmLabel="Export CSV"
        destructive
      />
    </div>
  );
}
