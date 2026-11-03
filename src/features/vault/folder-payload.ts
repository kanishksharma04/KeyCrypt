"use client";

import { useEffect, useState } from "react";
import { decryptItem, encryptItem, folderAad, getVaultKey } from "@/lib/crypto";
import type { FolderRow } from "@/server/folder-actions";
import type { DecryptedFolder } from "@/types/vault";
import { useVaultUserId } from "@/providers/vault-user-provider";

// Folder names are encrypted with the vault key, bound to (user, folder id):
//   nameCiphertext = AES-256-GCM(vaultKey, iv, JSON({ name }), AAD = folderAad(...))

export async function sealFolderName(
  key: CryptoKey,
  folder: { id: string; name: string },
  userId: string
): Promise<{ nameCiphertext: string; nameIv: string }> {
  const { ciphertext, iv } = await encryptItem(
    key,
    { name: folder.name },
    folderAad({ userId, folderId: folder.id })
  );
  return { nameCiphertext: ciphertext, nameIv: iv };
}

export async function openFolderName(
  key: CryptoKey,
  row: FolderRow,
  userId: string
): Promise<string> {
  const payload = await decryptItem<{ name?: unknown }>(
    key,
    { ciphertext: row.nameCiphertext, iv: row.nameIv },
    folderAad({ userId, folderId: row.id })
  );
  if (typeof payload?.name !== "string") throw new Error("Malformed folder name");
  return payload.name;
}

export const UNREADABLE_FOLDER_NAME = "Unreadable folder";

/** Decrypt folder names in the browser, sorted A–Z. */
export async function decryptFolders(
  key: CryptoKey,
  rows: readonly FolderRow[],
  userId: string
): Promise<DecryptedFolder[]> {
  const folders = await Promise.all(
    rows.map(async (row) => {
      try {
        return { id: row.id, name: await openFolderName(key, row, userId) };
      } catch {
        return { id: row.id, name: UNREADABLE_FOLDER_NAME };
      }
    })
  );
  return folders.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

export function useDecryptedFolders(rows: readonly FolderRow[]): DecryptedFolder[] {
  const userId = useVaultUserId();
  const [folders, setFolders] = useState<DecryptedFolder[]>([]);
  useEffect(() => {
    const key = getVaultKey();
    if (!key) return;
    let active = true;
    void decryptFolders(key, rows, userId).then((f) => active && setFolders(f));
    return () => {
      active = false;
    };
  }, [rows, userId]);
  return folders;
}
