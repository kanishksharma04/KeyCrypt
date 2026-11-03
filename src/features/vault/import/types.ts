import type {
  ApiKeySecret,
  LoginSecret,
  SecureNoteSecret,
  WifiPasswordSecret,
} from "@/types/vault";

// Items parsed from another password manager's export, before encryption.
// Everything here stays in the browser.

interface Base {
  name: string;
  favorite: boolean;
}

export type ImportedItem =
  | (Base & { type: "LOGIN"; secret: LoginSecret })
  | (Base & { type: "SECURE_NOTE"; secret: SecureNoteSecret })
  | (Base & { type: "API_KEY"; secret: ApiKeySecret })
  | (Base & { type: "WIFI_PASSWORD"; secret: WifiPasswordSecret });

/** A row (CSV: data row, 1-based, header excluded) or entry (JSON: 1-based) that was left out. */
export interface SkippedEntry {
  row: number;
  reason: string;
}

export interface ImportResult {
  items: ImportedItem[];
  skipped: SkippedEntry[];
}

export type ImportFormat =
  | "bitwarden-json"
  | "bitwarden-csv"
  | "1password-csv"
  | "lastpass-csv"
  | "chrome-csv"
  | "keycrypt-export";

/** The whole file can't be read in the chosen format. */
export class ImportFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportFormatError";
  }
}
