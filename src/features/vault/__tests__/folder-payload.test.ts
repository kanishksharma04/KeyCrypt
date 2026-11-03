import { describe, expect, it } from "vitest";
import { decryptItem, deriveVaultKey, folderAad, generateSalt, itemAad } from "@/lib/crypto";
import {
  decryptFolders,
  openFolderName,
  sealFolderName,
  UNREADABLE_FOLDER_NAME,
} from "../folder-payload";
import { filterVaultItems } from "../vault-toolbar";
import type { DecryptedVaultItem } from "@/types/vault";

const USER = "cuser000000000000000000001";
const F1 = "11111111-1111-4111-8111-111111111111";
const F2 = "22222222-2222-4222-8222-222222222222";

describe("folder names", () => {
  it("encrypts the name with AAD bound to user and folder id", async () => {
    const key = await deriveVaultKey("m", generateSalt(), 1_000);
    const sealed = await sealFolderName(key, { id: F1, name: "Work stuff" }, USER);
    expect(JSON.stringify(sealed)).not.toContain("Work");
    const row = { id: F1, ...sealed };
    expect(await openFolderName(key, row, USER)).toBe("Work stuff");

    // Moved to another folder id, or another user: refuses to decrypt.
    await expect(openFolderName(key, { ...row, id: F2 }, USER)).rejects.toThrow();
    await expect(openFolderName(key, row, "cuser000000000000000000002")).rejects.toThrow();
    // Can't be passed off as an item either.
    await expect(
      decryptItem(
        key,
        { ciphertext: sealed.nameCiphertext, iv: sealed.nameIv },
        itemAad({ userId: USER, itemId: F1, type: "LOGIN" })
      )
    ).rejects.toThrow();
    expect(folderAad({ userId: USER, folderId: F1 })).not.toBe(
      itemAad({ userId: USER, itemId: F1, type: "LOGIN" })
    );
  });

  it("decrypts a list A–Z and marks unreadable ones", async () => {
    const key = await deriveVaultKey("m", generateSalt(), 1_000);
    const rows = [
      { id: F1, ...(await sealFolderName(key, { id: F1, name: "personal" }, USER)) },
      { id: F2, ...(await sealFolderName(key, { id: F1, name: "Banking" }, USER)) }, // wrong AAD
    ];
    expect(await decryptFolders(key, rows, USER)).toEqual([
      { id: F1, name: "personal" },
      { id: F2, name: UNREADABLE_FOLDER_NAME },
    ]);
  });
});

describe("filterVaultItems by folder", () => {
  const base = { createdAt: "x", updatedAt: "x", favorite: false };
  const items: DecryptedVaultItem[] = [
    { ...base, id: "a", type: "SECURE_NOTE", name: "A", folderId: F1, secret: { content: "" } },
    { ...base, id: "b", type: "SECURE_NOTE", name: "B", folderId: null, secret: { content: "" } },
    { ...base, id: "c", type: "SECURE_NOTE", name: "C", secret: { content: "" } },
    { ...base, id: "d", type: "SECURE_NOTE", name: "D", folderId: F2, secret: { content: "" } },
  ];
  const ids = (folder: string) => filterVaultItems(items, "", false, folder).map((i) => i.id);

  it("shows everything, unfiled items, or one folder", () => {
    expect(ids("all")).toEqual(["a", "b", "c", "d"]);
    expect(ids("none")).toEqual(["b", "c"]);
    expect(ids(F1)).toEqual(["a"]);
    expect(ids(F2)).toEqual(["d"]);
  });
});
