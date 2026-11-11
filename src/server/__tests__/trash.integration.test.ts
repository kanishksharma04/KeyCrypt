import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { TRASH_RETENTION_DAYS } from "@/lib/trash-retention";
import { GET as cronGet } from "@/app/api/cron/prune-audit/route";
import { GET as extItemsGet } from "@/app/api/ext/items/route";
import { getVaultItemsForExportAction } from "@/server/export-actions";
import { moveItemToFolderAction } from "@/server/folder-actions";
import {
  getAllItemsForReEncryptionAction,
  getLoginItemsForHealthAction,
  getVaultStatsAction,
} from "@/server/settings-actions";
import {
  createVaultItemAction,
  getTrashedItemsAction,
  getVaultItemSummariesAction,
  purgeVaultItemAction,
  restoreVaultItemAction,
  toggleFavoriteAction,
  trashVaultItemAction,
  updateVaultItemAction,
} from "@/server/vault-item-actions";
import { MAX_VAULT_ITEMS } from "@/schemas/server";
import { createTestUser, signInAs } from "@/test/integration/helpers";

const DAY = 24 * 60 * 60 * 1000;
const CIPHER = { ciphertext: "Y2lwaGVydGV4dA==", iv: "aXYtaXYtaXYtaXYt" };
const CRON_SECRET = "cron-secret-for-trash-tests-0123456789";

type TestUser = Awaited<ReturnType<typeof createTestUser>>;

let alice: TestUser;
let kept: string;
let trashed: string;

async function item(userId: string, extra: { deletedAt?: Date; favorite?: boolean } = {}) {
  const { id } = await db.vaultItem.create({
    data: { userId, type: "LOGIN", ...CIPHER, ...extra },
    select: { id: true },
  });
  return id;
}

beforeEach(async () => {
  alice = await createTestUser({ email: "alice@test.local" });
  signInAs(alice);
  kept = await item(alice.id, { favorite: true });
  trashed = await item(alice.id, { favorite: true });
  expect(await trashVaultItemAction(trashed)).toEqual({});
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("moving an item to Trash", () => {
  it("sets deletedAt and records vault.item.trash", async () => {
    const row = await db.vaultItem.findUniqueOrThrow({ where: { id: trashed } });
    expect(row.deletedAt).toBeInstanceOf(Date);
    expect(
      await db.auditLog.count({ where: { userId: alice.id, action: "vault.item.trash" } })
    ).toBe(1);
  });

  it("hides it from the palette, export, health, stats and the extension API", async () => {
    const ids = (rows: unknown) => (rows as { id: string }[]).map((r) => r.id);

    expect(ids(await getVaultItemSummariesAction())).toEqual([kept]);
    expect(ids(await getVaultItemsForExportAction())).toEqual([kept]);
    expect(ids(await getLoginItemsForHealthAction())).toEqual([kept]);
    expect(await getVaultStatsAction()).toMatchObject({
      total: 1,
      favorites: 1,
      byType: { LOGIN: 1 },
    });

    const response = await extItemsGet(new Request("http://localhost/api/ext/items"));
    expect(ids(((await response.json()) as { items: unknown }).items)).toEqual([kept]);
  });

  it("lists it in Trash, and keeps it in the re-encryption set so it still decrypts after a restore", async () => {
    const inTrash = await getTrashedItemsAction();
    expect(inTrash).toEqual([
      expect.objectContaining({ id: trashed, deletedAt: expect.any(String) }),
    ]);
    expect(
      ((await getAllItemsForReEncryptionAction()) as { id: string }[]).map((r) => r.id).sort()
    ).toEqual([kept, trashed].sort());
  });

  it("refuses to edit, star or file a trashed item", async () => {
    expect(await updateVaultItemAction({ id: trashed, ...CIPHER })).toEqual({
      error: "Item not found",
    });
    expect(await toggleFavoriteAction(trashed, false)).toEqual({ error: "Item not found" });
    expect(await moveItemToFolderAction({ itemId: trashed, folderId: null })).toEqual({
      error: "Item not found",
    });
    expect(await trashVaultItemAction(trashed)).toEqual({ error: "Item not found" });
  });

  it("still counts toward the item cap", async () => {
    await db.vaultItem.createMany({
      data: Array.from({ length: MAX_VAULT_ITEMS - 2 }, () => ({
        userId: alice.id,
        type: "SECURE_NOTE" as const,
        ...CIPHER,
      })),
    });
    // 4,998 + kept + trashed = 5,000: full, even though one is in Trash.
    expect(await createVaultItemAction({ id: randomUUID(), type: "LOGIN", ...CIPHER })).toEqual({
      error: `A vault can hold up to ${MAX_VAULT_ITEMS.toLocaleString("en")} items.`,
    });
  });
});

describe("restore and delete forever", () => {
  it("restores an item to the vault and records vault.item.restore", async () => {
    expect(await restoreVaultItemAction(trashed)).toEqual({});
    expect(await db.vaultItem.findUniqueOrThrow({ where: { id: trashed } })).toMatchObject({
      deletedAt: null,
    });
    expect(
      ((await getVaultItemSummariesAction()) as { id: string }[]).map((r) => r.id).sort()
    ).toEqual([kept, trashed].sort());
    expect(await db.auditLog.count({ where: { action: "vault.item.restore" } })).toBe(1);
  });

  it("deletes a trashed item forever and records vault.item.purge", async () => {
    expect(await purgeVaultItemAction(trashed)).toEqual({});
    expect(await db.vaultItem.findUnique({ where: { id: trashed } })).toBeNull();
    expect(
      await db.auditLog.findFirstOrThrow({ where: { action: "vault.item.purge" } })
    ).toMatchObject({
      userId: alice.id,
      metadata: { count: 1 },
    });
  });

  it("only deletes forever, or restores, items that are in Trash", async () => {
    expect(await purgeVaultItemAction(kept)).toEqual({ error: "Item not found" });
    expect(await restoreVaultItemAction(kept)).toEqual({ error: "Item not found" });
    expect(await db.vaultItem.findUnique({ where: { id: kept } })).not.toBeNull();
  });

  it("rejects malformed ids without echoing them", async () => {
    for (const action of [trashVaultItemAction, restoreVaultItemAction, purgeVaultItemAction]) {
      expect(await action("'; DROP TABLE x;--")).toEqual({ error: "Invalid input" });
    }
  });
});

describe(`the daily cron purges items trashed more than ${TRASH_RETENTION_DAYS} days ago`, () => {
  it("deletes expired trash for every user, keeps recent trash and the vault", async () => {
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
    const bob = await createTestUser({ email: "bob@test.local" });
    const old = new Date(Date.now() - (TRASH_RETENTION_DAYS + 1) * DAY);
    const aliceOld = await item(alice.id, { deletedAt: old });
    const bobOld1 = await item(bob.id, { deletedAt: old });
    const bobOld2 = await item(bob.id, { deletedAt: old });
    const bobKept = await item(bob.id);

    const response = await cronGet(
      new Request("http://localhost/api/cron/prune-audit", {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ purgedItems: 3 });

    const remaining = (await db.vaultItem.findMany({ select: { id: true } })).map((r) => r.id);
    expect(remaining.sort()).toEqual([kept, trashed, bobKept].sort());
    expect(remaining).not.toContain(aliceOld);
    expect(remaining).not.toContain(bobOld1);
    expect(remaining).not.toContain(bobOld2);

    const purgeLog = await db.auditLog.findMany({
      where: { action: "vault.item.purge" },
      select: { userId: true, metadata: true },
    });
    expect(purgeLog).toEqual(
      expect.arrayContaining([
        { userId: alice.id, metadata: { count: 1, expired: true } },
        { userId: bob.id, metadata: { count: 2, expired: true } },
      ])
    );
  });
});
