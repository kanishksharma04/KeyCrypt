import { decryptItem, encryptItem, itemAad, type EncryptedPayload } from "@/lib/crypto";
import type { VaultItemType } from "@/types/vault";

// The encrypted payload of a vault item (crypto v2).
//
//   ciphertext = AES-256-GCM(vaultKey, iv, JSON({ name, secret }), AAD = itemAad(...))
//
// The name lives inside the ciphertext; VaultItem.name is null for such rows.
// Rows that still have a plain-text name (written before names were
// encrypted) hold just the secret, and are read with that name.

export interface ItemRef {
  id: string;
  type: VaultItemType;
  /** Plain-text name for older rows; null when the name is encrypted. */
  name: string | null;
  ciphertext: string;
  iv: string;
}

export interface OpenedItem<S = unknown> {
  name: string;
  secret: S;
}

/** Encrypt an item's name and secret, bound to (user, item id, type). */
export function sealItem(
  key: CryptoKey,
  item: { id: string; type: VaultItemType; name: string; secret: unknown },
  userId: string
): Promise<EncryptedPayload> {
  return encryptItem(
    key,
    { name: item.name, secret: item.secret },
    itemAad({ userId, itemId: item.id, type: item.type })
  );
}

/**
 * Decrypt a row. Throws if the ciphertext was moved from another row, type or
 * user (AAD), or if the payload is malformed.
 */
export async function openItem<S = unknown>(
  key: CryptoKey,
  row: ItemRef,
  userId: string
): Promise<OpenedItem<S>> {
  const raw = await decryptItem<unknown>(
    key,
    { ciphertext: row.ciphertext, iv: row.iv },
    itemAad({ userId, itemId: row.id, type: row.type })
  );

  if (row.name !== null) return { name: row.name, secret: raw as S };

  const envelope = raw as Partial<OpenedItem<S>> | null;
  if (
    !envelope ||
    typeof envelope.name !== "string" ||
    typeof envelope.secret !== "object" ||
    envelope.secret === null
  ) {
    throw new Error("Malformed item payload");
  }
  return { name: envelope.name, secret: envelope.secret };
}
