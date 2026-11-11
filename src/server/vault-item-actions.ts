"use server";

import { revalidatePath } from "next/cache";
import { Prisma, type VaultItemType } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { ITEM_CAP_ERROR, wouldExceedItemCap } from "@/lib/item-cap";
import {
  INVALID_INPUT,
  createVaultItemInput,
  createVaultItemsBatchInput,
  itemIdInput,
  toggleFavoriteInput,
  updateVaultItemInput,
} from "@/schemas/server";

/** Items not in Trash. Trashed items show only in the Trash view. */
const NOT_TRASHED = { deletedAt: null };

/**
 * Item list for the command palette: ciphertext only. The browser decrypts the
 * names (crypto v2) and searches and sorts them there. Excludes Trash.
 */
export async function getVaultItemSummariesAction(): Promise<
  | {
      id: string;
      type: VaultItemType;
      name: string | null;
      ciphertext: string;
      iv: string;
      favorite: boolean;
      folderId: string | null;
    }[]
  | { error: string }
> {
  const session = await auth();
  if (!session) return { error: "Not authenticated" };

  return db.vaultItem.findMany({
    where: { userId: session.user.id, ...NOT_TRASHED },
    select: {
      id: true,
      type: true,
      name: true,
      ciphertext: true,
      iv: true,
      favorite: true,
      folderId: true,
    },
  });
}

export async function createVaultItemAction(input: {
  /** Generated in the browser (UUID v4) and bound into the item's AAD. */
  id: string;
  type: VaultItemType;
  /** AES-GCM of { name, secret }, bound to (user, id, type). */
  ciphertext: string;
  iv: string;
}): Promise<{ id: string } | { error: string }> {
  const parsed = createVaultItemInput.safeParse(input);
  if (!parsed.success) return { error: INVALID_INPUT };
  const data = parsed.data;

  const session = await auth();
  if (!session) return { error: "Not authenticated" };

  if (await wouldExceedItemCap(session.user.id, 1)) return { error: ITEM_CAP_ERROR };

  let item: { id: string };
  try {
    item = await db.vaultItem.create({
      data: {
        id: data.id,
        userId: session.user.id,
        type: data.type,
        name: null, // encrypted inside the ciphertext
        ciphertext: data.ciphertext,
        iv: data.iv,
      },
      select: { id: true },
    });
  } catch (err) {
    // The id is chosen by the client: refuse to reuse one that already exists
    // (whoever owns it), never overwrite.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { error: "An item with this id already exists." };
    }
    throw err;
  }

  await logAudit(session.user.id, "vault.item.create", { type: data.type });

  revalidatePath("/vault");
  return { id: item.id };
}

/**
 * Import: create up to 50 items in one call. Each was encrypted in the browser
 * (crypto v2, AAD bound to its id); the server stores ciphertext only. An item
 * may name one of the user's folders (created beforehand by the browser).
 * All-or-nothing per batch.
 */
export async function createVaultItemsBatchAction(input: {
  items: Array<{
    id: string;
    type: VaultItemType;
    ciphertext: string;
    iv: string;
    favorite: boolean;
    folderId?: string | null;
  }>;
}): Promise<{ count: number } | { error: string }> {
  const parsed = createVaultItemsBatchInput.safeParse(input);
  if (!parsed.success) return { error: INVALID_INPUT };
  const { items } = parsed.data;

  const session = await auth();
  if (!session) return { error: "Not authenticated" };
  const userId = session.user.id;

  if (await wouldExceedItemCap(userId, items.length)) return { error: ITEM_CAP_ERROR };

  // Every folder referenced must be one of this user's.
  const folderIds = [...new Set(items.flatMap((i) => (i.folderId ? [i.folderId] : [])))];
  if (folderIds.length > 0) {
    const owned = await db.folder.count({ where: { userId, id: { in: folderIds } } });
    if (owned !== folderIds.length) return { error: "Folder not found" };
  }

  let count: number;
  try {
    ({ count } = await db.vaultItem.createMany({
      data: items.map((item) => ({
        id: item.id,
        userId,
        type: item.type,
        name: null, // encrypted inside the ciphertext
        ciphertext: item.ciphertext,
        iv: item.iv,
        favorite: item.favorite,
        folderId: item.folderId ?? null,
      })),
    }));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { error: "An item with this id already exists." };
    }
    // A folder was deleted between the check and the insert.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return { error: "Folder not found" };
    }
    throw err;
  }

  await logAudit(userId, "vault.items.imported", { count });

  revalidatePath("/vault");
  return { count };
}

export async function updateVaultItemAction(input: {
  id: string;
  /** AES-GCM of { name, secret }, bound to (user, id, type). */
  ciphertext: string;
  iv: string;
}): Promise<{ error?: string }> {
  const parsed = updateVaultItemInput.safeParse(input);
  if (!parsed.success) return { error: INVALID_INPUT };
  const data = parsed.data;

  const session = await auth();
  if (!session) return { error: "Not authenticated" };

  // userId in WHERE prevents IDOR — only the owner can update their items.
  // Items in Trash can't be edited; restore them first.
  const result = await db.vaultItem.updateMany({
    where: { id: data.id, userId: session.user.id, ...NOT_TRASHED },
    // The name is re-encrypted with the secret; clear any older plain-text name.
    data: { name: null, ciphertext: data.ciphertext, iv: data.iv },
  });

  if (result.count === 0) return { error: "Item not found" };

  revalidatePath("/vault");
  return {};
}

/** Moves an item to Trash. It can be restored for TRASH_RETENTION_DAYS. */
export async function trashVaultItemAction(rawId: string): Promise<{ error?: string }> {
  const parsed = itemIdInput.safeParse({ id: rawId });
  if (!parsed.success) return { error: INVALID_INPUT };
  const { id } = parsed.data;

  const session = await auth();
  if (!session) return { error: "Not authenticated" };

  // userId in WHERE prevents IDOR
  const result = await db.vaultItem.updateMany({
    where: { id, userId: session.user.id, ...NOT_TRASHED },
    data: { deletedAt: new Date() },
  });

  if (result.count === 0) return { error: "Item not found" };

  await logAudit(session.user.id, "vault.item.trash");

  revalidatePath("/vault");
  return {};
}

/** Moves an item out of Trash, back into the vault. */
export async function restoreVaultItemAction(rawId: string): Promise<{ error?: string }> {
  const parsed = itemIdInput.safeParse({ id: rawId });
  if (!parsed.success) return { error: INVALID_INPUT };
  const { id } = parsed.data;

  const session = await auth();
  if (!session) return { error: "Not authenticated" };

  // userId in WHERE prevents IDOR
  const result = await db.vaultItem.updateMany({
    where: { id, userId: session.user.id, deletedAt: { not: null } },
    data: { deletedAt: null },
  });

  if (result.count === 0) return { error: "Item not found" };

  await logAudit(session.user.id, "vault.item.restore");

  revalidatePath("/vault");
  return {};
}

/** "Delete forever": permanently deletes an item that is in Trash. */
export async function purgeVaultItemAction(rawId: string): Promise<{ error?: string }> {
  const parsed = itemIdInput.safeParse({ id: rawId });
  if (!parsed.success) return { error: INVALID_INPUT };
  const { id } = parsed.data;

  const session = await auth();
  if (!session) return { error: "Not authenticated" };

  // userId in WHERE prevents IDOR. Only items already in Trash.
  const result = await db.vaultItem.deleteMany({
    where: { id, userId: session.user.id, deletedAt: { not: null } },
  });

  if (result.count === 0) return { error: "Item not found" };

  await logAudit(session.user.id, "vault.item.purge", { count: 1 });

  revalidatePath("/vault");
  return {};
}

/** Items in Trash, newest first: ciphertext only (names decrypt in the browser). */
export async function getTrashedItemsAction(): Promise<
  | {
      id: string;
      type: VaultItemType;
      name: string | null;
      ciphertext: string;
      iv: string;
      favorite: boolean;
      folderId: string | null;
      createdAt: string;
      updatedAt: string;
      deletedAt: string;
    }[]
  | { error: string }
> {
  const session = await auth();
  if (!session) return { error: "Not authenticated" };

  const rows = await db.vaultItem.findMany({
    where: { userId: session.user.id, deletedAt: { not: null } },
    select: {
      id: true,
      type: true,
      name: true,
      ciphertext: true,
      iv: true,
      favorite: true,
      folderId: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
    },
    orderBy: { deletedAt: "desc" },
  });

  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: (row.deletedAt ?? row.updatedAt).toISOString(),
  }));
}

export async function toggleFavoriteAction(
  rawId: string,
  rawFavorite: boolean
): Promise<{ error?: string }> {
  const parsed = toggleFavoriteInput.safeParse({ id: rawId, favorite: rawFavorite });
  if (!parsed.success) return { error: INVALID_INPUT };
  const { id, favorite } = parsed.data;

  const session = await auth();
  if (!session) return { error: "Not authenticated" };

  // Starring isn't an edit: keep updatedAt (vault health flags logins not
  // updated in a year). Prisma's @updatedAt is applied by the client on every
  // update, so a single SQL UPDATE changes only `favorite`, atomically.
  // userId in WHERE prevents IDOR.
  const count = await db.$executeRaw`
    UPDATE "VaultItem" SET "favorite" = ${favorite}
    WHERE "id" = ${id} AND "userId" = ${session.user.id} AND "deletedAt" IS NULL`;

  if (count === 0) return { error: "Item not found" };

  revalidatePath("/vault");
  return {};
}
