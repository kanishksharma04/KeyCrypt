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
  VaultItemRow,
} from "@/types/vault";

// ─── Decrypt helper ──────────────────────────────────────────────────────────

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
  const base = {
    id: row.id,
    name,
    favorite: row.favorite,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };

  switch (row.type) {
    case "LOGIN":
      return { ...base, type: "LOGIN" as const, secret: secret as LoginSecret };
    case "SECURE_NOTE":
      return { ...base, type: "SECURE_NOTE" as const, secret: secret as SecureNoteSecret };
    case "API_KEY":
      return { ...base, type: "API_KEY" as const, secret: secret as ApiKeySecret };
    case "WIFI_PASSWORD":
      return { ...base, type: "WIFI_PASSWORD" as const, secret: secret as WifiPasswordSecret };
  }
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
          // Decryption errors surface as empty secrets so one bad item
          // doesn't hide the rest of the vault.
          return {
            id: row.id,
            type: row.type,
            name: row.name ?? UNREADABLE_ITEM_NAME,
            favorite: row.favorite,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            secret: {},
          } as DecryptedVaultItem;
        }
      })
    ).then((results) => {
      setDecrypted(results);
      setLoading(false);
    });
  }, [items, userId]);

  return { decrypted, loading };
}
