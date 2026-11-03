"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  INVALID_INPUT,
  MAX_FOLDERS,
  folderIdInput,
  folderInput,
  moveItemInput,
} from "@/schemas/server";

// Folders. Names are encrypted in the browser (vault key, AAD = user + folder
// id); the server stores and returns ciphertext only. Every query is scoped by
// the session user's id.

export interface FolderRow {
  id: string;
  nameCiphertext: string;
  nameIv: string;
}

const NOT_FOUND = "Folder not found";

export async function getFoldersAction(): Promise<FolderRow[] | { error: string }> {
  const session = await auth();
  if (!session) return { error: "Not authenticated" };
  return db.folder.findMany({
    where: { userId: session.user.id },
    select: { id: true, nameCiphertext: true, nameIv: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function createFolderAction(input: {
  id: string;
  nameCiphertext: string;
  nameIv: string;
}): Promise<{ id: string } | { error: string }> {
  const parsed = folderInput.safeParse(input);
  if (!parsed.success) return { error: INVALID_INPUT };
  const data = parsed.data;

  const session = await auth();
  if (!session) return { error: "Not authenticated" };
  const userId = session.user.id;

  if ((await db.folder.count({ where: { userId } })) >= MAX_FOLDERS) {
    return { error: `You can have up to ${MAX_FOLDERS} folders.` };
  }
  try {
    await db.folder.create({ data: { ...data, userId } });
  } catch (err) {
    // The id comes from the browser: never reuse or overwrite an existing one.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { error: "A folder with this id already exists." };
    }
    throw err;
  }
  revalidatePath("/vault");
  return { id: data.id };
}

/** Rename = store a new name ciphertext (re-encrypted in the browser). */
export async function renameFolderAction(input: {
  id: string;
  nameCiphertext: string;
  nameIv: string;
}): Promise<{ error?: string }> {
  const parsed = folderInput.safeParse(input);
  if (!parsed.success) return { error: INVALID_INPUT };
  const { id, nameCiphertext, nameIv } = parsed.data;

  const session = await auth();
  if (!session) return { error: "Not authenticated" };

  const { count } = await db.folder.updateMany({
    where: { id, userId: session.user.id },
    data: { nameCiphertext, nameIv },
  });
  if (count === 0) return { error: NOT_FOUND };
  revalidatePath("/vault");
  return {};
}

/** Delete a folder. Its items stay in the vault, unfiled (onDelete: SetNull). */
export async function deleteFolderAction(rawId: string): Promise<{ error?: string }> {
  const parsed = folderIdInput.safeParse({ id: rawId });
  if (!parsed.success) return { error: INVALID_INPUT };

  const session = await auth();
  if (!session) return { error: "Not authenticated" };

  const { count } = await db.folder.deleteMany({
    where: { id: parsed.data.id, userId: session.user.id },
  });
  if (count === 0) return { error: NOT_FOUND };
  revalidatePath("/vault");
  return {};
}

/** Move one of the user's items into one of their folders, or out of any (null). */
export async function moveItemToFolderAction(input: {
  itemId: string;
  folderId: string | null;
}): Promise<{ error?: string }> {
  const parsed = moveItemInput.safeParse(input);
  if (!parsed.success) return { error: INVALID_INPUT };
  const { itemId, folderId } = parsed.data;

  const session = await auth();
  if (!session) return { error: "Not authenticated" };
  const userId = session.user.id;

  const item = await db.vaultItem.findFirst({
    where: { id: itemId, userId },
    select: { updatedAt: true },
  });
  if (!item) return { error: "Item not found" };

  if (folderId) {
    const folder = await db.folder.findFirst({
      where: { id: folderId, userId },
      select: { id: true },
    });
    if (!folder) return { error: NOT_FOUND };
  }

  try {
    await db.vaultItem.updateMany({
      where: { id: itemId, userId },
      // Filing an item isn't an edit: keep updatedAt (vault health uses it).
      data: { folderId, updatedAt: item.updatedAt },
    });
  } catch (err) {
    // The folder was deleted in the meantime.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return { error: NOT_FOUND };
    }
    throw err;
  }
  revalidatePath("/vault");
  return {};
}
