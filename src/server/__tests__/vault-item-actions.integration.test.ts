import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  deleteVaultItemAction,
  toggleFavoriteAction,
  updateVaultItemAction,
} from "@/server/vault-item-actions";
import { createTestUser, signInAs } from "@/test/integration/helpers";

// Opaque test values — the server never sees real plaintext.
const ORIGINAL = { name: "GitHub", ciphertext: "b3JpZ2luYWw=", iv: "aXYtb3JpZ2luYWw=" };
// Names are encrypted inside the ciphertext now; updates never carry a plain-text name.
const TAMPERED = { ciphertext: "dGFtcGVyZWQ=", iv: "aXYtdGFtcGVyZWQ=" };

type TestUser = Awaited<ReturnType<typeof createTestUser>>;

describe("vault item actions: cross-user access (IDOR)", () => {
  let alice: TestUser;
  let bob: TestUser;
  let aliceItemId: string;

  beforeEach(async () => {
    alice = await createTestUser({ email: "alice@test.local" });
    bob = await createTestUser({ email: "bob@test.local" });
    const item = await db.vaultItem.create({
      data: { userId: alice.id, type: "LOGIN", favorite: false, ...ORIGINAL },
      select: { id: true },
    });
    aliceItemId = item.id;
  });

  async function aliceItem() {
    return db.vaultItem.findUnique({ where: { id: aliceItemId } });
  }

  it("user B cannot update user A's item", async () => {
    signInAs(bob);
    const result = await updateVaultItemAction({ id: aliceItemId, ...TAMPERED });

    expect(result).toEqual({ error: "Item not found" });
    expect(await aliceItem()).toMatchObject({ userId: alice.id, ...ORIGINAL });
  });

  it("user B cannot delete user A's item", async () => {
    signInAs(bob);
    const result = await deleteVaultItemAction(aliceItemId);

    expect(result).toEqual({ error: "Item not found" });
    expect(await aliceItem()).not.toBeNull();
    expect(await db.auditLog.count({ where: { action: "vault.item.delete" } })).toBe(0);
  });

  it("user B cannot favourite user A's item", async () => {
    signInAs(bob);
    const result = await toggleFavoriteAction(aliceItemId, true);

    expect(result).toEqual({ error: "Item not found" });
    expect(await aliceItem()).toMatchObject({ favorite: false });
  });

  // Control cases: prove the actions do work for the owner, so the denials
  // above are caused by ownership scoping and not by a broken action.
  it("the owner can update, favourite and delete their own item", async () => {
    signInAs(alice);

    expect(await updateVaultItemAction({ id: aliceItemId, ...TAMPERED })).toEqual({});
    // …and an edit clears any older plain-text name.
    expect(await aliceItem()).toMatchObject({ ...TAMPERED, name: null });

    expect(await toggleFavoriteAction(aliceItemId, true)).toEqual({});
    expect(await aliceItem()).toMatchObject({ favorite: true });

    expect(await deleteVaultItemAction(aliceItemId)).toEqual({});
    expect(await aliceItem()).toBeNull();
  });

  // Vault health flags logins not updated in a year from updatedAt, so starring
  // an item must not make it look freshly edited.
  it("starring and unstarring an item keeps its updatedAt", async () => {
    const longAgo = new Date("2024-01-15T10:00:00Z");
    await db.vaultItem.update({ where: { id: aliceItemId }, data: { updatedAt: longAgo } });
    signInAs(alice);

    expect(await toggleFavoriteAction(aliceItemId, true)).toEqual({});
    expect(await aliceItem()).toMatchObject({ favorite: true, updatedAt: longAgo });

    expect(await toggleFavoriteAction(aliceItemId, false)).toEqual({});
    expect(await aliceItem()).toMatchObject({ favorite: false, updatedAt: longAgo });
  });

  it("signed-out callers are rejected", async () => {
    expect(await updateVaultItemAction({ id: aliceItemId, ...TAMPERED })).toEqual({
      error: "Not authenticated",
    });
    expect(await deleteVaultItemAction(aliceItemId)).toEqual({ error: "Not authenticated" });
    expect(await toggleFavoriteAction(aliceItemId, true)).toEqual({ error: "Not authenticated" });
    expect(await aliceItem()).toMatchObject(ORIGINAL);
  });
});
