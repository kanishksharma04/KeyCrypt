import { randomUUID } from "crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { deriveVaultKey, generateSalt } from "@/lib/crypto";
import { MAX_FOLDERS } from "@/schemas/server";
import {
  createFolderAction,
  deleteFolderAction,
  getFoldersAction,
  moveItemToFolderAction,
  renameFolderAction,
} from "@/server/folder-actions";
import { openFolderName, sealFolderName } from "@/features/vault/folder-payload";
import { createTestUser, signInAs, signOutTestUser } from "@/test/integration/helpers";

type TestUser = Awaited<ReturnType<typeof createTestUser>>;

const sealedStub = { nameCiphertext: "bmFtZS1jaXBoZXI=", nameIv: "aXYtaXYtaXYtaXYt" };

async function itemFor(userId: string, folderId: string | null = null) {
  return db.vaultItem.create({
    data: { userId, type: "LOGIN", ciphertext: "YWJjZA==", iv: "aXYtaXYtaXYtaXYt", folderId },
    select: { id: true, updatedAt: true },
  });
}

describe("folder actions", () => {
  let alice: TestUser;
  let bob: TestUser;

  beforeEach(async () => {
    alice = await createTestUser({ email: "alice@test.local" });
    bob = await createTestUser({ email: "bob@test.local" });
    signInAs(alice);
  });

  it("creates, lists, renames and deletes a folder; the server only sees ciphertext", async () => {
    const key = await deriveVaultKey("master", generateSalt(), 1_000);
    const id = randomUUID();
    const sealed = await sealFolderName(key, { id, name: "Secret Project X" }, alice.id);
    expect(await createFolderAction({ id, ...sealed })).toEqual({ id });

    const rows = await getFoldersAction();
    expect(rows).toEqual([{ id, ...sealed }]);
    const stored = await db.folder.findUniqueOrThrow({ where: { id } });
    expect(JSON.stringify(stored)).not.toContain("Secret Project");
    expect(await openFolderName(key, stored, alice.id)).toBe("Secret Project X");

    const renamed = await sealFolderName(key, { id, name: "Renamed" }, alice.id);
    expect(await renameFolderAction({ id, ...renamed })).toEqual({});
    expect(
      await openFolderName(key, await db.folder.findUniqueOrThrow({ where: { id } }), alice.id)
    ).toBe("Renamed");

    expect(await deleteFolderAction(id)).toEqual({});
    expect(await db.folder.count()).toBe(0);
  });

  it("moves items in and out, keeping updatedAt; deleting the folder unfiles them", async () => {
    const folderId = randomUUID();
    await createFolderAction({ id: folderId, ...sealedStub });
    const item = await itemFor(alice.id);

    expect(await moveItemToFolderAction({ itemId: item.id, folderId })).toEqual({});
    let row = await db.vaultItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(row.folderId).toBe(folderId);
    expect(row.updatedAt).toEqual(item.updatedAt);

    expect(await moveItemToFolderAction({ itemId: item.id, folderId: null })).toEqual({});
    expect((await db.vaultItem.findUniqueOrThrow({ where: { id: item.id } })).folderId).toBeNull();

    await moveItemToFolderAction({ itemId: item.id, folderId });
    await deleteFolderAction(folderId);
    row = await db.vaultItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(row.folderId).toBeNull(); // onDelete: SetNull — the item survives
  });

  it("is scoped to the session user (no IDOR)", async () => {
    signInAs(bob);
    const bobFolder = randomUUID();
    await createFolderAction({ id: bobFolder, ...sealedStub });
    const bobItem = await itemFor(bob.id);

    signInAs(alice);
    const aliceFolder = randomUUID();
    await createFolderAction({ id: aliceFolder, ...sealedStub });
    const aliceItem = await itemFor(alice.id);

    expect(await getFoldersAction()).toEqual([{ id: aliceFolder, ...sealedStub }]);
    expect(await renameFolderAction({ id: bobFolder, ...sealedStub })).toEqual({
      error: "Folder not found",
    });
    expect(await deleteFolderAction(bobFolder)).toEqual({ error: "Folder not found" });
    // Not into someone else's folder, and not someone else's item.
    expect(await moveItemToFolderAction({ itemId: aliceItem.id, folderId: bobFolder })).toEqual({
      error: "Folder not found",
    });
    expect(await moveItemToFolderAction({ itemId: bobItem.id, folderId: aliceFolder })).toEqual({
      error: "Item not found",
    });
    expect(await db.folder.count({ where: { userId: bob.id } })).toBe(1);
    expect(
      (await db.vaultItem.findUniqueOrThrow({ where: { id: bobItem.id } })).folderId
    ).toBeNull();
  });

  it("refuses duplicate ids (even another user's), bad input and too many folders", async () => {
    const id = randomUUID();
    await createFolderAction({ id, ...sealedStub });
    signInAs(bob);
    expect(await createFolderAction({ id, ...sealedStub })).toEqual({
      error: "A folder with this id already exists.",
    });
    expect((await db.folder.findUniqueOrThrow({ where: { id } })).userId).toBe(alice.id);

    for (const bad of [
      { id: "not-a-uuid", ...sealedStub },
      { id: randomUUID(), nameCiphertext: "plain text name", nameIv: sealedStub.nameIv },
      { id: randomUUID(), nameCiphertext: sealedStub.nameCiphertext, nameIv: "short" },
      { id: randomUUID(), nameCiphertext: "A".repeat(4000), nameIv: sealedStub.nameIv },
    ]) {
      expect(await createFolderAction(bad)).toEqual({ error: "Invalid input" });
    }
    expect(await deleteFolderAction("x")).toEqual({ error: "Invalid input" });
    expect(await moveItemToFolderAction({ itemId: "x", folderId: null })).toEqual({
      error: "Invalid input",
    });

    await db.folder.createMany({
      data: Array.from({ length: MAX_FOLDERS }, () => ({
        id: randomUUID(),
        userId: bob.id,
        ...sealedStub,
      })),
    });
    expect(await createFolderAction({ id: randomUUID(), ...sealedStub })).toEqual({
      error: `You can have up to ${MAX_FOLDERS} folders.`,
    });
  });

  it("requires a session", async () => {
    signOutTestUser();
    expect(await getFoldersAction()).toEqual({ error: "Not authenticated" });
    expect(await createFolderAction({ id: randomUUID(), ...sealedStub })).toEqual({
      error: "Not authenticated",
    });
    expect(await deleteFolderAction(randomUUID())).toEqual({ error: "Not authenticated" });
  });
});
