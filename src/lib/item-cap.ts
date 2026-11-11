import { db } from "@/lib/db";
import { MAX_VAULT_ITEMS } from "@/schemas/server";

// The per-vault item cap, shared by the server actions and the extension API.

export const ITEM_CAP_ERROR = `A vault can hold up to ${MAX_VAULT_ITEMS.toLocaleString("en")} items.`;

/**
 * Whether adding `adding` items would take the user's vault past MAX_VAULT_ITEMS.
 * Items in Trash count: they still take space until they are purged.
 */
export async function wouldExceedItemCap(userId: string, adding: number): Promise<boolean> {
  const existing = await db.vaultItem.count({ where: { userId } });
  return existing + adding > MAX_VAULT_ITEMS;
}
