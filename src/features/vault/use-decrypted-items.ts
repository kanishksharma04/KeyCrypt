"use client";

import { useEffect, useState } from "react";
import { getVaultKey } from "@/lib/crypto";
import { openItem } from "./item-payload";
import { useVaultUserId } from "@/providers/vault-user-provider";
import type {
  DecryptedVaultItem,
  LoginSecret,
  SecureNoteSecret,
  ApiKeySecret,
  WifiPasswordSecret,
  OtpSecretSecret,
  VaultItemRow,
} from "@/types/vault";

// ─── Decrypt helper ──────────────────────────────────────────────────────────

/**
 * Every field of each secret type, empty. The UI (search, rows, the view and
 * edit dialogs) reads these fields directly, so each decrypted item gets all
 * of them: missing fields in an older payload become empty, and a row that
 * can't be decrypted gets an entirely empty secret instead of crashing them.
 */
const EMPTY_SECRETS = {
  LOGIN: { username: "", password: "", url: "", notes: "" },
  SECURE_NOTE: { content: "" },
  API_KEY: { key: "", description: "", notes: "" },
  WIFI_PASSWORD: { ssid: "", password: "", securityType: "WPA2", notes: "" },
  OTP_SECRET: {
    secret: "",
    issuer: "",
    account: "",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    notes: "",
  },
} as const satisfies {
  LOGIN: LoginSecret;
  SECURE_NOTE: SecureNoteSecret;
  API_KEY: ApiKeySecret;
  WIFI_PASSWORD: WifiPasswordSecret;
  OTP_SECRET: OtpSecretSecret;
};

/** The item for a row with this (already decrypted) secret, missing fields filled in. */
function toDecryptedItem(row: VaultItemRow, name: string, secret: unknown): DecryptedVaultItem {
  const base = {
    id: row.id,
    name,
    favorite: row.favorite,
    folderId: row.folderId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  const fields = secret !== null && typeof secret === "object" ? secret : {};

  switch (row.type) {
    case "LOGIN":
      return {
        ...base,
        type: row.type,
        secret: { ...EMPTY_SECRETS.LOGIN, ...(fields as Partial<LoginSecret>) },
      };
    case "SECURE_NOTE":
      return {
        ...base,
        type: row.type,
        secret: { ...EMPTY_SECRETS.SECURE_NOTE, ...(fields as Partial<SecureNoteSecret>) },
      };
    case "API_KEY":
      return {
        ...base,
        type: row.type,
        secret: { ...EMPTY_SECRETS.API_KEY, ...(fields as Partial<ApiKeySecret>) },
      };
    case "WIFI_PASSWORD":
      return {
        ...base,
        type: row.type,
        secret: { ...EMPTY_SECRETS.WIFI_PASSWORD, ...(fields as Partial<WifiPasswordSecret>) },
      };
    case "OTP_SECRET":
      return {
        ...base,
        type: row.type,
        secret: { ...EMPTY_SECRETS.OTP_SECRET, ...(fields as Partial<OtpSecretSecret>) },
      };
  }
}

/**
 * Decrypt one row (name and secret). The AAD binds the ciphertext to (user,
 * item id, type), so a ciphertext moved to another row, type or user fails.
 */
export async function decryptVaultItem(
  key: CryptoKey,
  row: VaultItemRow,
  userId: string
): Promise<DecryptedVaultItem> {
  const { name, secret } = await openItem<unknown>(key, row, userId);
  return toDecryptedItem(row, name, secret);
}

/** Shown for a row that fails to decrypt (its name is encrypted too). */
export const UNREADABLE_ITEM_NAME = "Unreadable item";

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Decrypts the server rows with the in-memory vault key. `loading` stays true
 * until the first decryption pass finishes (or while the vault is locked).
 */
export function useDecryptedItems(items: VaultItemRow[]) {
  const userId = useVaultUserId();
  const [decrypted, setDecrypted] = useState<DecryptedVaultItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const key = getVaultKey();
    if (!key) return;

    void Promise.all(
      items.map(async (row) => {
        try {
          return await decryptVaultItem(key, row, userId);
        } catch {
          // Decryption errors surface as empty secrets of the row's type so
          // one bad item doesn't hide (or crash) the rest of the vault.
          return toDecryptedItem(row, row.name ?? UNREADABLE_ITEM_NAME, null);
        }
      })
    ).then((results) => {
      setDecrypted(results);
      setLoading(false);
    });
  }, [items, userId]);

  return { decrypted, loading };
}
