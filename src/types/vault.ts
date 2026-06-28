import type { VaultItemType } from "@prisma/client";
import type { WifiSecurityType } from "@/schemas/vault";

export type { VaultItemType, WifiSecurityType };

// ─── Secret shapes (encrypted inside ciphertext) ─────────────────────────────

export interface LoginSecret {
  username: string;
  password: string;
  url: string;
  notes: string;
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

// ─── Decrypted item discriminated union ───────────────────────────────────────

interface BaseDecryptedItem {
  id: string;
  name: string;
  favorite: boolean;
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

export type DecryptedVaultItem =
  | DecryptedLoginItem
  | DecryptedSecureNoteItem
  | DecryptedApiKeyItem
  | DecryptedWifiPasswordItem;

// ─── Serializable row (Server Component → Client Component) ───────────────────

export interface VaultItemRow {
  id: string;
  type: VaultItemType;
  name: string;
  ciphertext: string;
  iv: string;
  favorite: boolean;
  createdAt: string; // ISO date string (serialized from Date)
  updatedAt: string;
}
