"use server";

import { revalidatePath } from "next/cache";
import type { VaultItemType } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  INVALID_INPUT,
  createVaultItemInput,
  itemIdInput,
  toggleFavoriteInput,
  updateVaultItemInput,
} from "@/schemas/server";

// Lightweight item list for the command palette — names are already stored in
// plaintext (see VaultItem schema comment), so no decryption is needed to search them.
export async function getVaultItemSummariesAction(): Promise<
  { id: string; type: VaultItemType; name: string }[] | { error: string }
> {
  const session = await auth();
  if (!session) return { error: "Not authenticated" };

  return db.vaultItem.findMany({
    where: { userId: session.user.id },
    select: { id: true, type: true, name: true },
    orderBy: [{ favorite: "desc" }, { updatedAt: "desc" }],
  });
}

export async function createVaultItemAction(input: {
  type: VaultItemType;
  name: string;
  ciphertext: string;
  iv: string;
}): Promise<{ id: string } | { error: string }> {
  const parsed = createVaultItemInput.safeParse(input);
  if (!parsed.success) return { error: INVALID_INPUT };
  const data = parsed.data;

  const session = await auth();
  if (!session) return { error: "Not authenticated" };

  const item = await db.vaultItem.create({
    data: {
      userId: session.user.id,
      type: data.type,
      name: data.name,
      ciphertext: data.ciphertext,
      iv: data.iv,
    },
    select: { id: true },
  });

  await db.auditLog.create({
    data: { userId: session.user.id, action: "vault.item.create", metadata: { type: data.type } },
  });

  revalidatePath("/vault");
  return { id: item.id };
}

export async function updateVaultItemAction(input: {
  id: string;
  name: string;
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
    data: { name: data.name, ciphertext: data.ciphertext, iv: data.iv },
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

  await db.auditLog.create({
    data: { userId: session.user.id, action: "vault.item.delete" },
  });

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
