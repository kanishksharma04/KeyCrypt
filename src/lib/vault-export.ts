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
    createdAt: string;
    updatedAt: string;
    secret: DecryptedVaultItem["secret"];
  }>;
}

export function buildExportPayload(
  items: DecryptedVaultItem[],
  now = new Date()
): VaultExportPayload {
  return {
    exportedAt: now.toISOString(),
    items: items.map(({ type, name, favorite, createdAt, updatedAt, secret }) => ({
      type,
      name,
      favorite,
      createdAt,
      updatedAt,
      secret,
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

function toRow(item: DecryptedVaultItem): CsvRow {
  const base: CsvRow = {
    folder: "",
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
  }
}

/** Plain-text CSV of every item, in Bitwarden's import column order. */
export function toBitwardenCsv(items: DecryptedVaultItem[]): string {
  const lines = [BITWARDEN_CSV_COLUMNS.join(",")];
  for (const item of items) {
    const row = toRow(item);
    lines.push(BITWARDEN_CSV_COLUMNS.map((c) => csvField(row[c] ?? "")).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

/** e.g. keycrypt-export-2026-10-31.json */
export function exportFilename(format: ExportFormat, now = new Date()): string {
  const date = now.toISOString().slice(0, 10);
  return `keycrypt-export-${date}.${format === "csv" ? "csv" : "json"}`;
}
