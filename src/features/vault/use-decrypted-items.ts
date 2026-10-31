"use client";

import { useEffect, useState } from "react";
import { getVaultKey, decryptItem } from "@/lib/crypto";
import type {
  DecryptedVaultItem,
  LoginSecret,
  SecureNoteSecret,
  ApiKeySecret,
  WifiPasswordSecret,
  VaultItemRow,
} from "@/types/vault";

// ─── Decrypt helper ──────────────────────────────────────────────────────────

export async function decryptVaultItem(
  key: CryptoKey,
  row: VaultItemRow
): Promise<DecryptedVaultItem> {
  const raw = await decryptItem<unknown>(key, { ciphertext: row.ciphertext, iv: row.iv });
  const base = {
    id: row.id,
    name: row.name,
    favorite: row.favorite,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };

  switch (row.type) {
    case "LOGIN":
      return { ...base, type: "LOGIN" as const, secret: raw as LoginSecret };
    case "SECURE_NOTE":
      return { ...base, type: "SECURE_NOTE" as const, secret: raw as SecureNoteSecret };
    case "API_KEY":
      return { ...base, type: "API_KEY" as const, secret: raw as ApiKeySecret };
    case "WIFI_PASSWORD":
      return { ...base, type: "WIFI_PASSWORD" as const, secret: raw as WifiPasswordSecret };
  }
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Decrypts the server rows with the in-memory vault key. `loading` stays true
 * until the first decryption pass finishes (or while the vault is locked).
 */
export function useDecryptedItems(items: VaultItemRow[]) {
  const [decrypted, setDecrypted] = useState<DecryptedVaultItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const key = getVaultKey();
    if (!key) return;

    void Promise.all(
      items.map(async (row) => {
        try {
          return await decryptVaultItem(key, row);
        } catch {
          // Decryption errors surface as empty secrets so one bad item
          // doesn't hide the rest of the vault.
          return {
            id: row.id,
            type: row.type,
            name: row.name,
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
  }, [items]);

  return { decrypted, loading };
}
