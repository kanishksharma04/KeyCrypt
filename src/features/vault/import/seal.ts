import { generateItemId } from "@/lib/crypto";
import { IMPORT_BATCH_MAX } from "@/schemas/server";
import { sealItem } from "../item-payload";
import type { ImportedItem } from "./types";

// Encrypt imported items in the browser (crypto v2: { name, secret } with AAD
// bound to user, a fresh item id and type), in batches for the server.

export const IMPORT_BATCH_SIZE = IMPORT_BATCH_MAX;

export interface SealedImportItem {
  id: string;
  type: ImportedItem["type"];
  ciphertext: string;
  iv: string;
  favorite: boolean;
  folderId: string | null;
}

/** Folder names match without regard to case or surrounding spaces. */
export function folderKey(name: string): string {
  return name.trim().toLowerCase();
}

/** The distinct folder names the items are filed in, in first-seen order. */
export function importFolderNames(items: readonly ImportedItem[]): string[] {
  const names = new Map<string, string>();
  for (const item of items) {
    if (item.folder && !names.has(folderKey(item.folder))) {
      names.set(folderKey(item.folder), item.folder);
    }
  }
  return [...names.values()];
}

/**
 * @param folderIds folderKey(name) → the id of the user's folder with that name.
 *   An item whose folder isn't in the map is imported without a folder.
 */
export async function sealImportBatches(
  items: readonly ImportedItem[],
  key: CryptoKey,
  userId: string,
  folderIds: ReadonlyMap<string, string> = new Map()
): Promise<SealedImportItem[][]> {
  const sealed = await Promise.all(
    items.map(async (item) => {
      const id = generateItemId();
      const { ciphertext, iv } = await sealItem(
        key,
        { id, type: item.type, name: item.name, secret: item.secret },
        userId
      );
      const folderId = item.folder ? (folderIds.get(folderKey(item.folder)) ?? null) : null;
      return { id, type: item.type, ciphertext, iv, favorite: item.favorite, folderId };
    })
  );
  const batches: SealedImportItem[][] = [];
  for (let i = 0; i < sealed.length; i += IMPORT_BATCH_SIZE) {
    batches.push(sealed.slice(i, i + IMPORT_BATCH_SIZE));
  }
  return batches;
}
