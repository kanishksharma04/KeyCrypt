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
}

export async function sealImportBatches(
  items: readonly ImportedItem[],
  key: CryptoKey,
  userId: string
): Promise<SealedImportItem[][]> {
  const sealed = await Promise.all(
    items.map(async (item) => {
      const id = generateItemId();
      const { ciphertext, iv } = await sealItem(
        key,
        { id, type: item.type, name: item.name, secret: item.secret },
        userId
      );
      return { id, type: item.type, ciphertext, iv, favorite: item.favorite };
    })
  );
  const batches: SealedImportItem[][] = [];
  for (let i = 0; i < sealed.length; i += IMPORT_BATCH_SIZE) {
    batches.push(sealed.slice(i, i + IMPORT_BATCH_SIZE));
  }
  return batches;
}
