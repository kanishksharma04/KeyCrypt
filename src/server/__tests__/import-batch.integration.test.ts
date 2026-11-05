import { randomUUID } from "crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { deriveVaultKey, generateSalt } from "@/lib/crypto";
import { MAX_VAULT_ITEMS } from "@/schemas/server";
import { createVaultItemAction, createVaultItemsBatchAction } from "@/server/vault-item-actions";
import { sealImportBatches, type ImportedItem } from "@/features/vault/import";
import { openItem } from "@/features/vault/item-payload";
import { createTestUser, signInAs, signOutTestUser } from "@/test/integration/helpers";

type TestUser = Awaited<ReturnType<typeof createTestUser>>;

const sealedStub = (overrides: Partial<{ id: string; favorite: boolean }> = {}) => ({
  id: randomUUID(),
  type: "LOGIN" as const,
  ciphertext: "Y2lwaGVydGV4dA==",
  iv: "aXYtaXYtaXYtaXYt",
  favorite: false,
  ...overrides,
});

describe("createVaultItemsBatchAction (import)", () => {
  let alice: TestUser;
  let bob: TestUser;

  beforeEach(async () => {
    alice = await createTestUser({ email: "alice@test.local" });
    bob = await createTestUser({ email: "bob@test.local" });
    signInAs(alice);
  });

  it("stores browser-encrypted items for the session user; every one decrypts", async () => {
    const key = await deriveVaultKey("master", generateSalt(), 1_000);
    const items: ImportedItem[] = Array.from({ length: 60 }, (_, i) => ({
      type: i % 2 ? "LOGIN" : "SECURE_NOTE",
      name: `Imported ${i}`,
      favorite: i === 3,
      secret:
        i % 2
          ? { username: "u", password: `pw-${i}`, url: "https://x.test", notes: "" }
          : { content: `note ${i}` },
    })) as ImportedItem[];

    for (const batch of await sealImportBatches(items, key, alice.id)) {
      expect(await createVaultItemsBatchAction({ items: batch })).toEqual({ count: batch.length });
    }

    const rows = await db.vaultItem.findMany({ where: { userId: alice.id } });
    expect(rows).toHaveLength(60);
    expect(rows.every((r) => r.name === null)).toBe(true);
    expect(rows.filter((r) => r.favorite)).toHaveLength(1);
    const opened = await Promise.all(rows.map((r) => openItem(key, r, alice.id)));
    expect(opened.map((o) => o.name).sort()).toEqual(items.map((i) => i.name).sort());
    // Ciphertext only: no plaintext reached the database.
    expect(JSON.stringify(rows)).not.toContain("pw-1");

    expect(await db.vaultItem.count({ where: { userId: bob.id } })).toBe(0);
    const audit = await db.auditLog.findMany({
      where: { userId: alice.id, action: "vault.items.imported" },
    });
    expect(audit.map((a) => a.metadata)).toEqual([{ count: 50 }, { count: 10 }]);
  });

  it("rejects more than 50 items, an empty batch, duplicate ids and malformed items", async () => {
    const tooMany = Array.from({ length: 51 }, () => sealedStub());
    expect(await createVaultItemsBatchAction({ items: tooMany })).toEqual({
      error: "Invalid input",
    });
    expect(await createVaultItemsBatchAction({ items: [] })).toEqual({ error: "Invalid input" });
    const id = randomUUID();
    expect(
      await createVaultItemsBatchAction({ items: [sealedStub({ id }), sealedStub({ id })] })
    ).toEqual({ error: "Invalid input" });
    expect(
      await createVaultItemsBatchAction({ items: [{ ...sealedStub(), iv: "short" }] })
    ).toEqual({ error: "Invalid input" });
    expect(await db.vaultItem.count()).toBe(0);
  });

  it("is all-or-nothing when an id already exists (even another user's)", async () => {
    const taken = randomUUID();
    await db.vaultItem.create({
      data: {
        id: taken,
        userId: bob.id,
        type: "LOGIN",
        ciphertext: "YWJjZA==",
        iv: "aXYtaXYtaXYtaXYt",
      },
    });
    expect(
      await createVaultItemsBatchAction({ items: [sealedStub(), sealedStub({ id: taken })] })
    ).toEqual({ error: "An item with this id already exists." });
    expect(await db.vaultItem.count({ where: { userId: alice.id } })).toBe(0);
    // Bob's row is untouched.
    expect((await db.vaultItem.findUniqueOrThrow({ where: { id: taken } })).userId).toBe(bob.id);
  });

  it("refuses to grow a vault past the item cap, by import or by a single create", async () => {
    await db.vaultItem.createMany({
      data: Array.from({ length: MAX_VAULT_ITEMS - 1 }, () => ({
        userId: alice.id,
        type: "LOGIN" as const,
        ciphertext: "YWJjZA==",
        iv: "aXYtaXYtaXYtaXYt",
      })),
    });
    expect(await createVaultItemsBatchAction({ items: [sealedStub(), sealedStub()] })).toEqual({
      error: "A vault can hold up to 5,000 items.",
    });
    expect(await createVaultItemsBatchAction({ items: [sealedStub()] })).toEqual({ count: 1 });

    // The vault is now full: a single create is refused as well.
    const { id, type, ciphertext, iv } = sealedStub();
    expect(await createVaultItemAction({ id, type, ciphertext, iv })).toEqual({
      error: "A vault can hold up to 5,000 items.",
    });
    expect(await db.vaultItem.count({ where: { userId: alice.id } })).toBe(MAX_VAULT_ITEMS);
  });

  it("files items in the user's own folders and refuses anyone else's", async () => {
    const folder = (userId: string) =>
      db.folder.create({
        data: { id: randomUUID(), userId, nameCiphertext: "YWJjZA==", nameIv: "aXYtaXYtaXYtaXYt" },
      });
    const mine = await folder(alice.id);
    const bobs = await folder(bob.id);

    const filed = sealedStub();
    expect(
      await createVaultItemsBatchAction({
        items: [{ ...filed, folderId: mine.id }, { ...sealedStub(), folderId: null }, sealedStub()],
      })
    ).toEqual({ count: 3 });
    const rows = await db.vaultItem.findMany({ where: { userId: alice.id } });
    expect(rows.find((r) => r.id === filed.id)?.folderId).toBe(mine.id);
    expect(rows.filter((r) => r.folderId === null)).toHaveLength(2);

    // Another user's folder, or one that doesn't exist: nothing is created.
    for (const folderId of [bobs.id, randomUUID()]) {
      expect(
        await createVaultItemsBatchAction({
          items: [sealedStub(), { ...sealedStub(), folderId }],
        })
      ).toEqual({ error: "Folder not found" });
    }
    expect(await db.vaultItem.count({ where: { userId: alice.id } })).toBe(3);
    expect(await db.vaultItem.count({ where: { folderId: bobs.id } })).toBe(0);
  });

  it("requires a session", async () => {
    signOutTestUser();
    expect(await createVaultItemsBatchAction({ items: [sealedStub()] })).toEqual({
      error: "Not authenticated",
    });
  });
});
