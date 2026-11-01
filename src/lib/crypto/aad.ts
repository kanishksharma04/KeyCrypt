// Associated data (AAD) for crypto v2 items.
//
// AES-GCM authenticates the AAD along with the ciphertext, so an item only
// decrypts with the exact (user, item id, type) it was encrypted for. A
// malicious server therefore can't swap ciphertexts between items, item types
// or users and have the browser accept them.

export interface ItemAadContext {
  userId: string;
  itemId: string;
  type: string;
}

const SEPARATOR = "|";

/** "kc:v2|<userId>|<itemId>|<type>" */
export function itemAad({ userId, itemId, type }: ItemAadContext): string {
  for (const part of [userId, itemId, type]) {
    // Ids are cuids/UUIDs and types are enum names; a separator would make the
    // encoding ambiguous, so refuse it outright.
    if (!part || part.includes(SEPARATOR)) throw new Error("Invalid AAD component");
  }
  return ["kc:v2", userId, itemId, type].join(SEPARATOR);
}

/**
 * A new item id, generated in the browser so it can be bound into the AAD
 * before the item is ever sent to the server (random UUID v4).
 */
export function generateItemId(): string {
  return globalThis.crypto.randomUUID();
}
