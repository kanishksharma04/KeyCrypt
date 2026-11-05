import type { ZodTypeAny } from "zod";
import { parseTotpInput, totpParamsToUri, type TotpParams } from "@/lib/crypto";
import {
  apiKeySchema,
  loginItemSchema,
  otpSecretSchema,
  secureNoteSchema,
  wifiPasswordSchema,
  WIFI_SECURITY_TYPES,
  type WifiSecurityType,
} from "@/schemas/vault";
import type { ImportedItem, ImportResult } from "./types";

// Shared helpers for the import parsers (pure).

const MAX_NAME = 100;

const SCHEMAS: Record<ImportedItem["type"], ZodTypeAny> = {
  LOGIN: loginItemSchema,
  SECURE_NOTE: secureNoteSchema,
  API_KEY: apiKeySchema,
  WIFI_PASSWORD: wifiPasswordSchema,
  OTP_SECRET: otpSecretSchema,
};

const FIELD_LABELS: Record<string, string> = {
  username: "Username",
  password: "Password",
  url: "URL",
  notes: "Notes",
  content: "Content",
  key: "Key",
  description: "Description",
  ssid: "SSID",
  securityType: "Security",
  secret: "Authenticator key",
  totp: "Authenticator key",
};

/** A scalar from untrusted input as a string; anything else becomes "". */
export function str(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

/** "1", "true", "yes" (any case) → true. */
export function truthy(value: unknown): boolean {
  if (value === true || value === 1) return true;
  return ["1", "true", "yes", "y"].includes(str(value).trim().toLowerCase());
}

function hostOf(url: string): string {
  const u = url.trim();
  if (!u) return "";
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(u) ? u : `https://${u}`).hostname;
  } catch {
    return "";
  }
}

/** The item's name, else the URL's host, else a fallback; at most 100 characters. */
export function itemName(name: string, url = "", fallback = "Imported item"): string {
  const n = name.trim() || hostOf(url) || fallback;
  return n.length > MAX_NAME ? `${n.slice(0, MAX_NAME - 1)}…` : n;
}

/** A folder name from another app: trimmed, at most 100 characters; "" for none. */
export function folderName(name: string): string {
  const n = name.trim();
  return n.length > MAX_NAME ? `${n.slice(0, MAX_NAME - 1)}…` : n;
}

/** "Label: value" lines for the non-empty pairs. */
export function fieldLines(pairs: ReadonlyArray<readonly [string, string]>): string {
  return pairs
    .filter(([, v]) => v.trim() !== "")
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}

/** Join non-empty note sections with a blank line. */
export function joinNotes(...parts: string[]): string {
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join("\n\n");
}

/** Every scalar in an object as "Label: value" pairs, keys turned into words. */
export function flattenFields(obj: unknown): Array<[string, string]> {
  if (!obj || typeof obj !== "object") return [];
  return Object.entries(obj as Record<string, unknown>)
    .map(([k, v]): [string, string] => [humanize(k), str(v)])
    .filter(([, v]) => v !== "");
}

function humanize(key: string): string {
  const words = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Parse Bitwarden-style custom fields ("Name: value" per line). */
export function parseFieldLines(text: string): Array<[string, string]> {
  return text
    .split(/\r?\n/)
    .map((line): [string, string] | null => {
      const i = line.indexOf(": ");
      if (i <= 0) return line.trim() ? ["Field", line.trim()] : null;
      return [line.slice(0, i).trim(), line.slice(i + 2)];
    })
    .filter((p): p is [string, string] => p !== null);
}

export function asWifiSecurity(value: string): WifiSecurityType {
  return (WIFI_SECURITY_TYPES as readonly string[]).includes(value)
    ? (value as WifiSecurityType)
    : "WPA2";
}

/**
 * Collects parsed items, validating each against the same limits as the item
 * dialogs. Anything that doesn't fit is reported as skipped, with the reason.
 */
export class ImportCollector {
  private readonly result: ImportResult = { items: [], skipped: [] };

  /** Add a parsed item, filed in the folder with this name (if any). */
  add(row: number, item: ImportedItem, folder = ""): void {
    const check = SCHEMAS[item.type].safeParse({ name: item.name, ...item.secret });
    if (!check.success) {
      const issue = check.error.issues[0];
      const field = String(issue?.path[0] ?? "");
      this.skip(row, `${FIELD_LABELS[field] ?? "A field"}: ${issue?.message ?? "invalid"}`);
      return;
    }
    const name = folderName(folder);
    this.result.items.push(name ? { ...item, folder: name } : item);
  }

  skip(row: number, reason: string): void {
    this.result.skipped.push({ row, reason });
  }

  done(): ImportResult {
    return this.result;
  }
}

/**
 * A note from another manager that matches KeyCrypt's own CSV export of an
 * API key or WiFi password (custom fields) becomes that type again.
 */
export function noteOrTypedItem(
  name: string,
  favorite: boolean,
  notes: string,
  fields: Array<[string, string]>
): ImportedItem {
  const get = (label: string) => fields.find(([k]) => k === label)?.[1];
  const labels = new Set(fields.map(([k]) => k));

  const apiKey = get("API key");
  if (apiKey !== undefined && [...labels].every((l) => ["API key", "Description"].includes(l))) {
    return {
      type: "API_KEY",
      name,
      favorite,
      secret: { key: apiKey, description: get("Description") ?? "", notes },
    };
  }
  const ssid = get("SSID");
  if (
    ssid !== undefined &&
    [...labels].every((l) => ["SSID", "Password", "Security"].includes(l))
  ) {
    return {
      type: "WIFI_PASSWORD",
      name,
      favorite,
      secret: {
        ssid,
        password: get("Password") ?? "",
        securityType: asWifiSecurity(get("Security") ?? ""),
        notes,
      },
    };
  }
  return {
    type: "SECURE_NOTE",
    name,
    favorite,
    secret: { content: joinNotes(notes, fieldLines(fields)) },
  };
}

/** Parse a TOTP value from another app (otpauth:// link or base32 key); null if invalid. */
export function importedTotp(
  raw: string,
  labels: { issuer?: string; account?: string } = {}
): TotpParams | null {
  if (!raw.trim()) return null;
  try {
    return parseTotpInput(raw, labels);
  } catch {
    return null;
  }
}

/**
 * A login, with its authenticator key if it has one. With no username,
 * password or URL it becomes an authenticator (if it has a key) or a secure
 * note. A TOTP value that can't be parsed is kept in the notes instead.
 */
export function loginOrNote(
  name: string,
  favorite: boolean,
  login: { username: string; password: string; url: string; notes: string; totp?: string }
): ImportedItem {
  const { totp: raw = "", ...fields } = login;
  const params = importedTotp(raw, { issuer: name, account: login.username });
  const notes = params || !raw.trim() ? login.notes : joinNotes(login.notes, `TOTP: ${raw}`);

  if (!login.username && !login.password && !login.url) {
    if (params) return { type: "OTP_SECRET", name, favorite, secret: { ...params, notes } };
    return { type: "SECURE_NOTE", name, favorite, secret: { content: notes } };
  }
  return {
    type: "LOGIN",
    name,
    favorite,
    secret: { ...fields, notes, ...(params && { totp: totpParamsToUri(params) }) },
  };
}
