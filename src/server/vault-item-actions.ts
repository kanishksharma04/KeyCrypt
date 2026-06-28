"use server";

import { revalidatePath } from "next/cache";
import type { VaultItemType } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function createVaultItemAction(data: {
  type: VaultItemType;
  name: string;
  ciphertext: string;
  iv: string;
}): Promise<{ id: string } | { error: string }> {
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

export async function updateVaultItemAction(data: {
  id: string;
  name: string;
  ciphertext: string;
  iv: string;
}): Promise<{ error?: string }> {
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

export async function deleteVaultItemAction(id: string): Promise<{ error?: string }> {
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
  id: string,
  favorite: boolean
): Promise<{ error?: string }> {
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
