import { totpParamsToUri } from "@/lib/crypto";
import type { DecryptedVaultItem } from "@/types/vault";

// Pure helpers for Settings → Export. Everything runs in the browser on items
// that were decrypted there; nothing here touches the network.

export type ExportFormat = "encrypted-json" | "csv";

/** The plaintext payload sealed inside an encrypted export. */
export interface VaultExportPayload {
  exportedAt: string;
  items: Array<{
    type: DecryptedVaultItem["type"];
    name: string;
    favorite: boolean;
    /** Folder name; "" when the item isn't in a folder. Absent in older exports. */
    folder: string;
    createdAt: string;
    updatedAt: string;
    secret: DecryptedVaultItem["secret"];
  }>;
}

/** Folder id → decrypted folder name. */
export type FolderNames = ReadonlyMap<string, string>;

function folderOf(item: DecryptedVaultItem, folders: FolderNames): string {
  return item.folderId ? (folders.get(item.folderId) ?? "") : "";
}

export function buildExportPayload(
  items: DecryptedVaultItem[],
  folders: FolderNames = new Map(),
  now = new Date()
): VaultExportPayload {
  return {
    exportedAt: now.toISOString(),
    items: items.map((item) => ({
      type: item.type,
      name: item.name,
      favorite: item.favorite,
      folder: folderOf(item, folders),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      secret: item.secret,
    })) as VaultExportPayload["items"],
  };
}

// ─── CSV (Bitwarden-compatible) ──────────────────────────────────────────────

/** Bitwarden's individual-vault CSV columns, in its order. */
export const BITWARDEN_CSV_COLUMNS = [
  "folder",
  "favorite",
  "type",
  "name",
  "notes",
  "fields",
  "reprompt",
  "login_uri",
  "login_username",
  "login_password",
  "login_totp",
] as const;

type CsvRow = Record<(typeof BITWARDEN_CSV_COLUMNS)[number], string>;

/** RFC 4180: quote fields containing a comma, quote or line break; double inner quotes. */
function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Bitwarden custom fields: one "Name: value" per line. */
function customFields(pairs: Array<[string, string]>): string {
  return pairs
    .filter(([, v]) => v !== "")
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}

function toRow(item: DecryptedVaultItem, folders: FolderNames): CsvRow {
  const base: CsvRow = {
    folder: folderOf(item, folders),
    favorite: item.favorite ? "1" : "",
    type: "note",
    name: item.name,
    notes: "",
    fields: "",
    reprompt: "0",
    login_uri: "",
    login_username: "",
    login_password: "",
    login_totp: "",
  };

  switch (item.type) {
    case "LOGIN":
      return {
        ...base,
        type: "login",
        notes: item.secret.notes,
        login_uri: item.secret.url,
        login_username: item.secret.username,
        login_password: item.secret.password,
        login_totp: item.secret.totp ?? "",
      };
    case "SECURE_NOTE":
      return { ...base, notes: item.secret.content };
    // Bitwarden's CSV has no API-key or WiFi types: export them as notes with
    // their values in custom fields.
    case "API_KEY":
      return {
        ...base,
        notes: item.secret.notes,
        fields: customFields([
          ["API key", item.secret.key],
          ["Description", item.secret.description],
        ]),
      };
    case "WIFI_PASSWORD":
      return {
        ...base,
        notes: item.secret.notes,
        fields: customFields([
          ["SSID", item.secret.ssid],
          ["Password", item.secret.password],
          ["Security", item.secret.securityType],
        ]),
      };
    // An authenticator becomes a Bitwarden login holding just the TOTP link.
    case "OTP_SECRET":
      return {
        ...base,
        type: "login",
        notes: item.secret.notes,
        login_username: item.secret.account,
        login_totp: totpParamsToUri(item.secret),
      };
  }
}

/** Plain-text CSV of every item, in Bitwarden's import column order. */
export function toBitwardenCsv(
  items: DecryptedVaultItem[],
  folders: FolderNames = new Map()
): string {
  const lines = [BITWARDEN_CSV_COLUMNS.join(",")];
  for (const item of items) {
    const row = toRow(item, folders);
    lines.push(BITWARDEN_CSV_COLUMNS.map((c) => csvField(row[c] ?? "")).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

/** e.g. keycrypt-export-2026-10-31.json */
export function exportFilename(format: ExportFormat, now = new Date()): string {
  const date = now.toISOString().slice(0, 10);
  return `keycrypt-export-${date}.${format === "csv" ? "csv" : "json"}`;
}
