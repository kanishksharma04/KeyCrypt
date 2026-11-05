import { generateItemId } from "@/lib/crypto";
import { MAX_FOLDERS } from "@/schemas/server";
import type { FolderRow } from "@/server/folder-actions";
import { openFolderName, sealFolderName } from "../folder-payload";
import { folderKey, importFolderNames } from "./seal";
import type { ImportedItem } from "./types";

// Map the folder names in an import to the user's folders, creating the missing
// ones. Names are matched and encrypted in the browser; the server only sees
// folder ids and name ciphertext. Not re-exported from ./index (it calls server
// actions, which are passed in).

export interface FolderApi {
  getFolders: () => Promise<FolderRow[] | { error: string }>;
  createFolder: (input: FolderRow) => Promise<{ id: string } | { error: string }>;
}

/** folderKey(name) → folder id, for every folder the items are filed in. */
export async function resolveImportFolders(
  items: readonly ImportedItem[],
  key: CryptoKey,
  userId: string,
  api: FolderApi
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  const wanted = importFolderNames(items);
  if (wanted.length === 0) return ids;

  const rows = await api.getFolders();
  if ("error" in rows) throw new Error(rows.error);
  for (const row of rows) {
    try {
      const name = await openFolderName(key, row, userId);
      // Two existing folders with the same name: the older one (listed first) wins.
      if (!ids.has(folderKey(name))) ids.set(folderKey(name), row.id);
    } catch {
      // An unreadable folder never matches an imported name.
    }
  }

  const missing = wanted.filter((name) => !ids.has(folderKey(name)));
  if (rows.length + missing.length > MAX_FOLDERS) {
    throw new Error(
      `This import needs ${missing.length} new folder${missing.length === 1 ? "" : "s"}, which would take you past the limit of ${MAX_FOLDERS}.`
    );
  }
  for (const name of missing) {
    const id = generateItemId();
    const created = await api.createFolder({
      id,
      ...(await sealFolderName(key, { id, name }, userId)),
    });
    if ("error" in created) throw new Error(created.error);
    ids.set(folderKey(name), id);
  }
  return ids;
}
