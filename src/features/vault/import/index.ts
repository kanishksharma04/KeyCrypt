import { parseBitwardenCsv, parseBitwardenJson } from "./bitwarden";
import { parseChromeCsv } from "./chrome";
import { isKeyCryptExport, parseKeyCryptExport } from "./keycrypt";
import { parseLastPassCsv } from "./lastpass";
import { parseOnePasswordCsv } from "./onepassword";
import { ImportFormatError, type ImportFormat, type ImportResult } from "./types";

export * from "./types";
export { sealImportBatches, IMPORT_BATCH_SIZE } from "./seal";

export const IMPORT_FORMATS: ReadonlyArray<{ id: ImportFormat; label: string }> = [
  { id: "bitwarden-json", label: "Bitwarden (.json, unencrypted)" },
  { id: "bitwarden-csv", label: "Bitwarden (.csv)" },
  { id: "1password-csv", label: "1Password (.csv)" },
  { id: "lastpass-csv", label: "LastPass (.csv)" },
  { id: "chrome-csv", label: "Chrome / Edge (.csv)" },
  { id: "keycrypt-export", label: "KeyCrypt encrypted export (.json)" },
];

/** Guess the format from the file's content. Null if it isn't recognised. */
export function detectImportFormat(text: string): ImportFormat | null {
  const trimmed = text.replace(/^﻿/, "").trimStart();
  if (trimmed.startsWith("{")) {
    if (isKeyCryptExport(trimmed)) return "keycrypt-export";
    try {
      const data = JSON.parse(trimmed) as { items?: unknown };
      return Array.isArray(data?.items) ? "bitwarden-json" : null;
    } catch {
      return null;
    }
  }
  const header = (trimmed.split(/\r?\n/, 1)[0] ?? "")
    .toLowerCase()
    .split(",")
    .map((h) => h.trim().replace(/^"|"$/g, ""));
  const has = (h: string) => header.includes(h);
  if (has("login_password")) return "bitwarden-csv";
  if (has("extra") && has("grouping")) return "lastpass-csv";
  if (has("title") && has("password")) return "1password-csv";
  if (has("url") && has("username") && has("password")) return "chrome-csv";
  return null;
}

/**
 * Parse an export file in the browser. `exportPassword` is needed only for a
 * KeyCrypt encrypted export.
 */
export async function parseImportFile(
  format: ImportFormat,
  text: string,
  exportPassword = ""
): Promise<ImportResult> {
  switch (format) {
    case "bitwarden-json":
      return parseBitwardenJson(text);
    case "bitwarden-csv":
      return parseBitwardenCsv(text);
    case "1password-csv":
      return parseOnePasswordCsv(text);
    case "lastpass-csv":
      return parseLastPassCsv(text);
    case "chrome-csv":
      return parseChromeCsv(text);
    case "keycrypt-export":
      if (!exportPassword) throw new ImportFormatError("Enter the export password.");
      return parseKeyCryptExport(text, exportPassword);
  }
}

/** Items per type, for the preview. */
export function countByType(result: ImportResult): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of result.items) counts[item.type] = (counts[item.type] ?? 0) + 1;
  return counts;
}
