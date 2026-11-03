"use server";

import { revalidatePath } from "next/cache";
import { Prisma, type VaultItemType } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import {
  INVALID_INPUT,
  createVaultItemInput,
  createVaultItemsBatchInput,
  MAX_ITEMS_PER_REKEY,
  itemIdInput,
  toggleFavoriteInput,
  updateVaultItemInput,
} from "@/schemas/server";

/**
 * Item list for the command palette: ciphertext only. The browser decrypts the
 * names (crypto v2) and searches and sorts them there.
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
    where: { userId: session.user.id },
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
 * (crypto v2, AAD bound to its id); the server stores ciphertext only.
 * All-or-nothing per batch.
 */
export async function createVaultItemsBatchAction(input: {
  items: Array<{
    id: string;
    type: VaultItemType;
    ciphertext: string;
    iv: string;
    favorite: boolean;
  }>;
}): Promise<{ count: number } | { error: string }> {
  const parsed = createVaultItemsBatchInput.safeParse(input);
  if (!parsed.success) return { error: INVALID_INPUT };
  const { items } = parsed.data;

  const session = await auth();
  if (!session) return { error: "Not authenticated" };
  const userId = session.user.id;

  // Changing the master password re-encrypts every item in one request, which
  // is capped; don't let an import grow the vault past that.
  const existing = await db.vaultItem.count({ where: { userId } });
  if (existing + items.length > MAX_ITEMS_PER_REKEY) {
    return { error: `A vault can hold up to ${MAX_ITEMS_PER_REKEY.toLocaleString("en")} items.` };
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
      })),
    }));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { error: "An item with this id already exists." };
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

  // userId in WHERE prevents IDOR — only the owner can update their items
  const result = await db.vaultItem.updateMany({
    where: { id: data.id, userId: session.user.id },
    // The name is re-encrypted with the secret; clear any older plain-text name.
    data: { name: null, ciphertext: data.ciphertext, iv: data.iv },
  });

  if (result.count === 0) return { error: "Item not found" };

  revalidatePath("/vault");
  return {};
}

export async function deleteVaultItemAction(rawId: string): Promise<{ error?: string }> {
  const parsed = itemIdInput.safeParse({ id: rawId });
  if (!parsed.success) return { error: INVALID_INPUT };
  const { id } = parsed.data;

  const session = await auth();
  if (!session) return { error: "Not authenticated" };

  // userId in WHERE prevents IDOR
  const result = await db.vaultItem.deleteMany({
    where: { id, userId: session.user.id },
  });

  if (result.count === 0) return { error: "Item not found" };

  await logAudit(session.user.id, "vault.item.delete");

  revalidatePath("/vault");
  return {};
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

  const result = await db.vaultItem.updateMany({
    where: { id, userId: session.user.id },
    data: { favorite },
  });

  if (result.count === 0) return { error: "Item not found" };

  revalidatePath("/vault");
  return {};
}
