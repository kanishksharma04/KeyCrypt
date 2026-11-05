import { describe, expect, it } from "vitest";
import { deriveVaultKey, generateSalt } from "@/lib/crypto";
import { MAX_FOLDERS } from "@/schemas/server";
import type { FolderRow } from "@/server/folder-actions";
import { openFolderName, sealFolderName } from "../../folder-payload";
import { folderKey, type ImportedItem } from "..";
import { resolveImportFolders, type FolderApi } from "../resolve-folders";

const USER_ID = "cuser000000000000000000001";
const EXISTING_ID = "0b7f3c1e-2a4d-4e8f-9a1b-3c5d7e9f1a2b";

const note = (name: string, folder?: string): ImportedItem => ({
  type: "SECURE_NOTE",
  name,
  favorite: false,
  ...(folder && { folder }),
  secret: { content: name },
});

/** In-memory stand-in for the folder server actions. */
function fakeApi(rows: FolderRow[]): FolderApi & { rows: FolderRow[] } {
  return {
    rows,
    getFolders: async () => [...rows],
    createFolder: async (input) => {
      rows.push(input);
      return { id: input.id };
    },
  };
}

describe("resolveImportFolders", () => {
  it("reuses a folder with the same name and creates the rest, encrypted", async () => {
    const key = await deriveVaultKey("test-master", generateSalt(), 1_000);
    const existing = {
      id: EXISTING_ID,
      ...(await sealFolderName(key, { id: EXISTING_ID, name: "Work" }, USER_ID)),
    };
    const api = fakeApi([existing]);

    const ids = await resolveImportFolders(
      [note("a", "work "), note("b", "Travel"), note("c", "travel"), note("d")],
      key,
      USER_ID,
      api
    );

    expect(ids.get(folderKey("Work"))).toBe(EXISTING_ID);
    expect(api.rows).toHaveLength(2); // only "Travel" was created
    const created = api.rows[1]!;
    expect(ids.get(folderKey("Travel"))).toBe(created.id);
    // The server only gets ciphertext, which opens to the name under its own id.
    expect(JSON.stringify(created)).not.toContain("Travel");
    expect(await openFolderName(key, created, USER_ID)).toBe("Travel");
  });

  it("does nothing when no item is in a folder", async () => {
    const key = await deriveVaultKey("test-master", generateSalt(), 1_000);
    const api = fakeApi([]);
    let fetched = false;
    api.getFolders = async () => {
      fetched = true;
      return [];
    };
    expect((await resolveImportFolders([note("a")], key, USER_ID, api)).size).toBe(0);
    expect(fetched).toBe(false);
  });

  it("refuses up front when the new folders would pass the limit", async () => {
    const key = await deriveVaultKey("test-master", generateSalt(), 1_000);
    const unreadable = { nameCiphertext: "YWJjZA==", nameIv: "aXYtaXYtaXYtaXYt" };
    const rows = Array.from({ length: MAX_FOLDERS - 1 }, (_, i) => ({
      id: `id-${i}`,
      ...unreadable,
    }));
    const api = fakeApi(rows);
    await expect(
      resolveImportFolders([note("a", "One"), note("b", "Two")], key, USER_ID, api)
    ).rejects.toThrow(/limit of 200/);
    expect(api.rows).toHaveLength(MAX_FOLDERS - 1);
  });

  it("stops on a server error", async () => {
    const key = await deriveVaultKey("test-master", generateSalt(), 1_000);
    const api = fakeApi([]);
    api.createFolder = async () => ({ error: "Not authenticated" });
    await expect(resolveImportFolders([note("a", "One")], key, USER_ID, api)).rejects.toThrow(
      "Not authenticated"
    );
  });
});
