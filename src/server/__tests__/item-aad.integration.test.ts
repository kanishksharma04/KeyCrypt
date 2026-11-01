import { beforeEach, describe, expect, it } from "vitest";
import { generateItemId, generateVaultKey } from "@/lib/crypto";
import { db } from "@/lib/db";
import { createVaultItemAction } from "@/server/vault-item-actions";
import { decryptVaultItem } from "@/features/vault/use-decrypted-items";
import { sealItem } from "@/features/vault/item-payload";
import type { VaultItemRow } from "@/types/vault";
import { createTestUser, signInAs } from "@/test/integration/helpers";

// A malicious (or buggy) server cannot move v2 ciphertext between rows: the
// browser binds each item to (user, item id, type) with AES-GCM AAD. Names are
// encrypted with the secret, so the server stores no plain-text name.

const LOGIN = (password: string) => ({ username: "a", password, url: "", notes: "" });

let userId: string;
let key: CryptoKey;

async function createItem(type: "LOGIN" | "SECURE_NOTE", name: string, secret: object) {
  const id = generateItemId();
  const { ciphertext, iv } = await sealItem(key, { id, type, name, secret }, userId);
  const result = await createVaultItemAction({ id, type, ciphertext, iv });
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
    const id = await createItem("LOGIN", "Chase Bank", LOGIN("p"));

    // The server stores no plain-text name…
    const stored = await db.vaultItem.findUniqueOrThrow({ where: { id } });
    expect(stored.name).toBeNull();
    expect(stored.ciphertext).not.toContain("Chase");

    // …the browser decrypts it along with the secret.
    const item = await decryptVaultItem(key, await row(id), userId);
    expect(item.name).toBe("Chase Bank");
    expect(item.secret).toMatchObject({ password: "p" });
  });

  it("fails after the server swaps ciphertexts between two items", async () => {
    const a = await createItem("LOGIN", "A", LOGIN("pa"));
    const b = await createItem("LOGIN", "B", LOGIN("pb"));
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
    const id = await createItem("LOGIN", "Mine", LOGIN("p"));
    const other = await createTestUser();
    await db.vaultItem.update({ where: { id }, data: { userId: other.id } });
    await expect(decryptVaultItem(key, await row(id), other.id)).rejects.toThrow();
  });
});

describe("createVaultItemAction with client-chosen ids", () => {
  const payload = { type: "LOGIN" as const, ciphertext: "Y2lwaGVy", iv: "AAAAAAAAAAAAAAAA" };

  it("rejects a duplicate id (even another user's) without overwriting", async () => {
    const id = generateItemId();
    expect(await createVaultItemAction({ id, ...payload })).toEqual({ id });

    const other = await createTestUser();
    signInAs(other);
    expect(await createVaultItemAction({ id, ...payload, ciphertext: "aGlqYWNr" })).toEqual({
      error: "An item with this id already exists.",
    });
    expect(await db.vaultItem.findUniqueOrThrow({ where: { id } })).toMatchObject({
      userId,
      ciphertext: "Y2lwaGVy",
    });
  });

  it("rejects ids that are neither a UUID v4 nor a cuid", async () => {
    for (const id of ["1", "not-a-uuid", "00000000-0000-1000-8000-000000000000"]) {
      expect(await createVaultItemAction({ id, ...payload })).toEqual({ error: "Invalid input" });
    }
    expect(await db.vaultItem.count()).toBe(0);
  });
});
