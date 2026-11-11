import type { VaultItemType } from "@prisma/client";
import type { WifiSecurityType } from "@/schemas/vault";

export type { VaultItemType, WifiSecurityType };

// ─── Secret shapes (encrypted inside ciphertext) ─────────────────────────────

/** A password a login used before, and when it was replaced. */
export interface PasswordHistoryEntry {
  password: string;
  /** ISO time the password was replaced. */
  changedAt: string;
}

export interface LoginSecret {
  username: string;
  password: string;
  url: string;
  notes: string;
  /** Optional authenticator key, as an otpauth://totp/ link. Absent or "" = none. */
  totp?: string;
  /**
   * Earlier passwords, newest first, at most 10 (src/features/vault/password-history.ts).
   * Encrypted with the rest of the secret. Absent in older items = no history.
   */
  passwordHistory?: PasswordHistoryEntry[];
}

export interface SecureNoteSecret {
  content: string;
}

export interface ApiKeySecret {
  key: string;
  description: string;
  notes: string;
}

export interface WifiPasswordSecret {
  ssid: string;
  password: string;
  securityType: WifiSecurityType;
  notes: string;
}

/** An authenticator (TOTP) secret with the parameters its codes use. */
export interface OtpSecretSecret {
  /** Base32, upper case. */
  secret: string;
  issuer: string;
  account: string;
  algorithm: "SHA1" | "SHA256" | "SHA512";
  digits: number;
  period: number;
  notes: string;
}

// ─── Decrypted item discriminated union ───────────────────────────────────────

interface BaseDecryptedItem {
  id: string;
  name: string;
  favorite: boolean;
  /** The folder it is filed in, if any. */
  folderId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DecryptedLoginItem extends BaseDecryptedItem {
  type: "LOGIN";
  secret: LoginSecret;
}

export interface DecryptedSecureNoteItem extends BaseDecryptedItem {
  type: "SECURE_NOTE";
  secret: SecureNoteSecret;
}

export interface DecryptedApiKeyItem extends BaseDecryptedItem {
  type: "API_KEY";
  secret: ApiKeySecret;
}

export interface DecryptedWifiPasswordItem extends BaseDecryptedItem {
  type: "WIFI_PASSWORD";
  secret: WifiPasswordSecret;
}

export interface DecryptedOtpSecretItem extends BaseDecryptedItem {
  type: "OTP_SECRET";
  secret: OtpSecretSecret;
}

export type DecryptedVaultItem =
  | DecryptedLoginItem
  | DecryptedSecureNoteItem
  | DecryptedApiKeyItem
  | DecryptedWifiPasswordItem
  | DecryptedOtpSecretItem;

// ─── Serializable row (Server Component → Client Component) ───────────────────

export interface VaultItemRow {
  id: string;
  type: VaultItemType;
  /** Plain-text name for rows not yet on encrypted names; null when encrypted (v2). */
  name: string | null;
  ciphertext: string;
  iv: string;
  favorite: boolean;
  folderId?: string | null;
  createdAt: string; // ISO date string (serialized from Date)
  updatedAt: string;
}

// ─── Folders ─────────────────────────────────────────────────────────────────

/** A folder with its name decrypted in the browser. */
export interface DecryptedFolder {
  id: string;
  name: string;
}
