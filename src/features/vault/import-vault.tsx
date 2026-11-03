"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { ExportDecryptionError, getVaultKey } from "@/lib/crypto";
import { createVaultItemsBatchAction } from "@/server/vault-item-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useVaultUserId } from "@/providers/vault-user-provider";
import {
  countByType,
  detectImportFormat,
  IMPORT_FORMATS,
  ImportFormatError,
  parseImportFile,
  sealImportBatches,
  type ImportFormat,
  type ImportResult,
} from "./import";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_SKIPPED_SHOWN = 20;

const TYPE_LABELS: Record<string, [string, string]> = {
  LOGIN: ["login", "logins"],
  SECURE_NOTE: ["secure note", "secure notes"],
  API_KEY: ["API key", "API keys"],
  WIFI_PASSWORD: ["WiFi password", "WiFi passwords"],
};

function plural(type: string, n: number): string {
  const [one, many] = TYPE_LABELS[type] ?? [type, type];
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Settings → Import. The file is read and parsed in this browser and every
 * item is encrypted here before it is sent; the file itself is never uploaded.
 */
export function ImportVault() {
  const router = useRouter();
  const userId = useVaultUserId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileText, setFileText] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [format, setFormat] = useState<ImportFormat | "">("");
  const [exportPassword, setExportPassword] = useState("");
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [progress, setProgress] = useState<string>();
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  function reset() {
    setFileText(null);
    setFileName("");
    setFormat("");
    setExportPassword("");
    setPreview(null);
    setProgress(undefined);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function onFile(file: File | undefined) {
    setError(undefined);
    setPreview(null);
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setError("That file is larger than 20 MB.");
      return;
    }
    const text = await file.text();
    setFileText(text);
    setFileName(file.name);
    setFormat(detectImportFormat(text) ?? "");
  }

  function buildPreview() {
    if (!fileText || !format) return;
    setError(undefined);
    startTransition(async () => {
      try {
        setPreview(await parseImportFile(format, fileText, exportPassword));
      } catch (err) {
        setError(
          err instanceof ImportFormatError || err instanceof ExportDecryptionError
            ? err.message
            : "That file couldn't be read."
        );
      }
    });
  }

  function runImport() {
    if (!preview || preview.items.length === 0) return;
    setError(undefined);
    startTransition(async () => {
      const key = getVaultKey();
      if (!key) {
        setError("Vault is locked. Unlock it and try again.");
        return;
      }
      const total = preview.items.length;
      let done = 0;
      try {
        const batches = await sealImportBatches(preview.items, key, userId);
        for (const items of batches) {
          setProgress(`Importing… ${done} of ${total}`);
          const result = await createVaultItemsBatchAction({ items });
          if ("error" in result) throw new Error(result.error);
          done += result.count;
        }
      } catch (err) {
        setError(
          `${done} of ${total} items were imported before an error: ${
            err instanceof Error ? err.message : "unknown error"
          }`
        );
        setProgress(undefined);
        router.refresh();
        return;
      }
      toast.success(`Imported ${total} item${total === 1 ? "" : "s"}.`);
      reset();
      router.refresh();
    });
  }

  const counts = preview ? countByType(preview) : {};

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Supports Bitwarden (JSON or CSV), 1Password, LastPass and Chrome/Edge CSV exports, and
        KeyCrypt encrypted exports. The file is read in this browser and never uploaded; each item
        is encrypted here before it is saved. Delete the exported file afterwards: it holds your
        passwords in plain text.
      </p>

      {error && (
        <div
          role="alert"
          className="bg-destructive/10 text-destructive flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
        >
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      <div className="space-y-1">
        <label htmlFor="import-file" className="text-sm font-medium">
          Export file
        </label>
        <Input
          ref={fileInput}
          id="import-file"
          type="file"
          accept=".csv,.json,text/csv,application/json"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </div>

      {fileText !== null && (
        <div className="space-y-1">
          <label htmlFor="import-format" className="text-sm font-medium">
            Format
          </label>
          <select
            id="import-format"
            className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            value={format}
            onChange={(e) => {
              setFormat(e.target.value as ImportFormat | "");
              setPreview(null);
            }}
          >
            <option value="">Choose a format…</option>
            {IMPORT_FORMATS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
          {!format && (
            <p className="text-muted-foreground text-xs">
              {fileName} wasn&apos;t recognised. Choose the app it came from.
            </p>
          )}
        </div>
      )}

      {format === "keycrypt-export" && (
        <div className="space-y-1">
          <label htmlFor="import-export-password" className="text-sm font-medium">
            Export password
          </label>
          <Input
            id="import-export-password"
            type="password"
            autoComplete="off"
            value={exportPassword}
            onChange={(e) => setExportPassword(e.target.value)}
          />
        </div>
      )}

      {fileText !== null && !preview && (
        <Button
          type="button"
          variant="outline"
          onClick={buildPreview}
          disabled={!format || isPending || (format === "keycrypt-export" && !exportPassword)}
        >
          {isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          Preview import
        </Button>
      )}

      {preview && (
        <div className="space-y-3 rounded-lg border p-3" aria-label="Import preview">
          <p className="text-sm font-medium">
            {preview.items.length === 0
              ? "Nothing to import."
              : `Ready to import ${preview.items.length} item${preview.items.length === 1 ? "" : "s"}: ${Object.entries(
                  counts
                )
                  .map(([type, n]) => plural(type, n))
                  .join(", ")}.`}
          </p>
          {preview.skipped.length > 0 && (
            <div className="space-y-1">
              <p className="text-sm">
                {preview.skipped.length} row{preview.skipped.length === 1 ? "" : "s"} will be
                skipped:
              </p>
              <ul
                className="text-muted-foreground list-disc pl-5 text-xs"
                aria-label="Skipped rows"
              >
                {preview.skipped.slice(0, MAX_SKIPPED_SHOWN).map((s) => (
                  <li key={s.row}>
                    Row {s.row}: {s.reason}
                  </li>
                ))}
                {preview.skipped.length > MAX_SKIPPED_SHOWN && (
                  <li>…and {preview.skipped.length - MAX_SKIPPED_SHOWN} more</li>
                )}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={runImport}
              disabled={isPending || preview.items.length === 0}
            >
              {isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <FileUp className="size-4" aria-hidden="true" />
              )}
              Import {preview.items.length} item{preview.items.length === 1 ? "" : "s"}
            </Button>
            <Button type="button" variant="ghost" onClick={reset} disabled={isPending}>
              Cancel
            </Button>
            {progress && <span className="text-muted-foreground text-xs">{progress}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
