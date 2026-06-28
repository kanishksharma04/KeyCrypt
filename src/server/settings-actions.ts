"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// ─── Stats ─────────────────────────────────────────────────────────────────────

export interface VaultStats {
  total: number;
  favorites: number;
  byType: { LOGIN: number; SECURE_NOTE: number; API_KEY: number; WIFI_PASSWORD: number };
  lastModified: string | null; // ISO date string
}

export async function getVaultStatsAction(): Promise<VaultStats | null> {
  const session = await auth();
  if (!session) return null;

  const userId = session.user.id;

  const [groups, favoriteCount, lastItem] = await Promise.all([
    db.vaultItem.groupBy({ by: ["type"], where: { userId }, _count: true }),
    db.vaultItem.count({ where: { userId, favorite: true } }),
    db.vaultItem.findFirst({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
  ]);

  const byType = { LOGIN: 0, SECURE_NOTE: 0, API_KEY: 0, WIFI_PASSWORD: 0 };
  let total = 0;
  for (const g of groups) {
    byType[g.type] += g._count;
    total += g._count;
  }

  return {
    total,
    favorites: favoriteCount,
    byType,
    lastModified: lastItem?.updatedAt.toISOString() ?? null,
  };
}

// ─── Re-encryption ─────────────────────────────────────────────────────────────

export async function getAllItemsForReEncryptionAction(): Promise<
  { id: string; ciphertext: string; iv: string }[] | { error: string }
> {
  const session = await auth();
  if (!session) return { error: "Not authenticated" };

  const items = await db.vaultItem.findMany({
    where: { userId: session.user.id },
    select: { id: true, ciphertext: true, iv: true },
  });

  return items;
}

export async function changeMasterPasswordAction(data: {
  newSalt: string;
  newVerificationBlob: string;
  newVerificationIv: string;
  items: { id: string; ciphertext: string; iv: string }[];
}): Promise<{ error?: string }> {
  const session = await auth();
  if (!session) return { error: "Not authenticated" };

  const userId = session.user.id;

  // All items must belong to this user (prevents tampering with other users' data)
  if (data.items.length > 0) {
    const count = await db.vaultItem.count({
      where: { userId, id: { in: data.items.map((i) => i.id) } },
    });
    if (count !== data.items.length) return { error: "Item ownership check failed" };
  }

  // Atomic transaction: update VaultMeta + re-encrypt all items
  await db.$transaction([
    db.vaultMeta.update({
      where: { userId },
      data: {
        salt: data.newSalt,
        verificationBlob: data.newVerificationBlob,
        verificationIv: data.newVerificationIv,
      },
    }),
    ...data.items.map((item) =>
      db.vaultItem.update({
        where: { id: item.id },
        data: { ciphertext: item.ciphertext, iv: item.iv },
      })
    ),
  ]);

  await db.auditLog.create({
    data: { userId, action: "vault.master_password.changed" },
  });

  revalidatePath("/vault");
  return {};
}

// ─── Session management ────────────────────────────────────────────────────────

export interface SessionInfo {
  id: string;
  expires: string; // ISO date string
  isCurrent: boolean;
}

export async function getSessionsAction(): Promise<SessionInfo[]> {
  const session = await auth();
  if (!session) return [];

  const jar = await cookies();
  const currentToken =
    jar.get("authjs.session-token")?.value ?? jar.get("__Secure-authjs.session-token")?.value ?? "";

  const sessions = await db.session.findMany({
    where: { userId: session.user.id },
    select: { id: true, sessionToken: true, expires: true },
    orderBy: { expires: "desc" },
  });

  return sessions.map((s) => ({
    id: s.id,
    expires: s.expires.toISOString(),
    isCurrent: s.sessionToken === currentToken,
  }));
}

export async function revokeOtherSessionsAction(): Promise<{ error?: string }> {
  const session = await auth();
  if (!session) return { error: "Not authenticated" };

  const jar = await cookies();
  const currentToken =
    jar.get("authjs.session-token")?.value ?? jar.get("__Secure-authjs.session-token")?.value ?? "";

  await db.session.deleteMany({
    where: {
      userId: session.user.id,
      ...(currentToken ? { sessionToken: { not: currentToken } } : {}),
    },
  });

  await db.auditLog.create({
    data: { userId: session.user.id, action: "auth.sessions.revoked_others" },
  });

  revalidatePath("/vault/settings");
  return {};
}

export async function revokeAllSessionsAction(): Promise<void> {
  const session = await auth();
  if (!session) return;

  await db.session.deleteMany({ where: { userId: session.user.id } });

  await db.auditLog.create({
    data: { userId: session.user.id, action: "auth.sessions.revoked_all" },
  });

  redirect("/auth/signin");
}
