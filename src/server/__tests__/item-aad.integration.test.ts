import { beforeEach, describe, expect, it } from "vitest";
import { encryptItem, generateItemId, generateVaultKey, itemAad } from "@/lib/crypto";
import { db } from "@/lib/db";
import { createVaultItemAction } from "@/server/vault-item-actions";
import { decryptVaultItem } from "@/features/vault/use-decrypted-items";
import type { VaultItemRow } from "@/types/vault";
import { createTestUser, signInAs } from "@/test/integration/helpers";

// A malicious (or buggy) server cannot move v2 ciphertext between rows: the
// browser binds each item to (user, item id, type) with AES-GCM AAD.

let userId: string;
let key: CryptoKey;

async function createItem(type: "LOGIN" | "SECURE_NOTE", name: string, secret: object) {
  const id = generateItemId();
  const { ciphertext, iv } = await encryptItem(key, secret, itemAad({ userId, itemId: id, type }));
  const result = await createVaultItemAction({ id, type, name, ciphertext, iv });
  if ("error" in result) throw new Error(result.error);
  return id;
}

async function row(id: string): Promise<VaultItemRow> {
  const r = await db.vaultItem.findUniqueOrThrow({ where: { id } });
  return {
    id: r.id,
    type: r.type,
    name: r.name,
    ciphertext: r.ciphertext,
    iv: r.iv,
    favorite: r.favorite,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

beforeEach(async () => {
  const user = await createTestUser();
  userId = user.id;
  signInAs(user);
  key = await generateVaultKey();
});

describe("v2 items decrypt only in their own row", () => {
  it("decrypts normally, using the id chosen in the browser", async () => {
    const id = await createItem("LOGIN", "GitHub", {
      username: "a",
      password: "p",
      url: "",
      notes: "",
    });
    expect(await db.vaultItem.findUnique({ where: { id } })).not.toBeNull();
    expect((await decryptVaultItem(key, await row(id), userId)).secret).toMatchObject({
      password: "p",
    });
  });

  it("fails after the server swaps ciphertexts between two items", async () => {
    const a = await createItem("LOGIN", "A", { username: "a", password: "pa", url: "", notes: "" });
    const b = await createItem("LOGIN", "B", { username: "b", password: "pb", url: "", notes: "" });
    const [ra, rb] = [await row(a), await row(b)];
    await db.vaultItem.update({ where: { id: a }, data: { ciphertext: rb.ciphertext, iv: rb.iv } });
    await db.vaultItem.update({ where: { id: b }, data: { ciphertext: ra.ciphertext, iv: ra.iv } });

    await expect(decryptVaultItem(key, await row(a), userId)).rejects.toThrow();
    await expect(decryptVaultItem(key, await row(b), userId)).rejects.toThrow();
  });

  it("fails after the server changes an item's type", async () => {
    const id = await createItem("SECURE_NOTE", "Note", { content: "x" });
    await db.vaultItem.update({ where: { id }, data: { type: "LOGIN" } });
    await expect(decryptVaultItem(key, await row(id), userId)).rejects.toThrow();
  });

  it("fails after the server moves an item to another user", async () => {
    const id = await createItem("LOGIN", "Mine", {
      username: "a",
      password: "p",
      url: "",
      notes: "",
    });
    const other = await createTestUser();
    await db.vaultItem.update({ where: { id }, data: { userId: other.id } });
    await expect(decryptVaultItem(key, await row(id), other.id)).rejects.toThrow();
  });
});

describe("createVaultItemAction with client-chosen ids", () => {
  const payload = {
    type: "LOGIN" as const,
    name: "x",
    ciphertext: "Y2lwaGVy",
    iv: "AAAAAAAAAAAAAAAA",
  };

  it("rejects a duplicate id (even another user's) without overwriting", async () => {
    const id = generateItemId();
    expect(await createVaultItemAction({ id, ...payload })).toEqual({ id });

    const other = await createTestUser();
    signInAs(other);
    expect(await createVaultItemAction({ id, ...payload, name: "hijack" })).toEqual({
      error: "An item with this id already exists.",
    });
    expect(await db.vaultItem.findUniqueOrThrow({ where: { id } })).toMatchObject({
      userId,
      name: "x",
    });
  });

  it("rejects ids that are neither a UUID v4 nor a cuid", async () => {
    for (const id of ["1", "not-a-uuid", "00000000-0000-1000-8000-000000000000"]) {
      expect(await createVaultItemAction({ id, ...payload })).toEqual({ error: "Invalid input" });
    }
    expect(await db.vaultItem.count()).toBe(0);
  });
});
