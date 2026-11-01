"use server";

import { revalidatePath } from "next/cache";
import { auth, signOut } from "@/lib/auth";
import { revokeAllSessions } from "@/lib/session-version";
import { requireRecentReauth } from "@/lib/reauth";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { VAULT_CHANGED_ERROR } from "@/lib/action-errors";
import { INVALID_INPUT, changeMasterPasswordInput } from "@/schemas/server";

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

// ─── Vault health ──────────────────────────────────────────────────────────────
// Returns ciphertext only — decryption and scoring happen entirely client-side.

export async function getLoginItemsForHealthAction(): Promise<
  | { id: string; name: string; ciphertext: string; iv: string; updatedAt: string }[]
  | { error: string }
> {
  const session = await auth();
  if (!session) return { error: "Not authenticated" };

  const items = await db.vaultItem.findMany({
    where: { userId: session.user.id, type: "LOGIN" },
    select: { id: true, name: true, ciphertext: true, iv: true, updatedAt: true },
  });

  return items.map((item) => ({ ...item, updatedAt: item.updatedAt.toISOString() }));
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

/** Thrown inside the transaction to roll back. */
class VaultChangedError extends Error {}

/**
 * Change the master password (crypto v2): store the SAME vault key re-wrapped
 * under a key-encryption key from the new password. Items are untouched.
 *
 * The client must prove it read the current wrapped key (it unwrapped it with
 * the current password), and the change needs a recent account-password
 * confirmation. Serializable isolation aborts if the key changed meanwhile.
 */
export async function changeMasterPasswordAction(input: {
  currentWrappedVaultKey: string;
  currentWrapIv: string;
  newSalt: string;
  newWrappedVaultKey: string;
  newWrapIv: string;
}): Promise<{ error?: string }> {
  const parsed = changeMasterPasswordInput.safeParse(input);
  if (!parsed.success) return { error: INVALID_INPUT };
  const data = parsed.data;

  const session = await auth();
  if (!session) return { error: "Not authenticated" };

  const userId = session.user.id;

  const reauth = await requireRecentReauth(userId);
  if (!reauth.ok) return { error: reauth.error };

  try {
    await db.$transaction(
      async (tx) => {
        const meta = await tx.vaultMeta.findUnique({
          where: { userId },
          select: { cryptoVersion: true, wrappedVaultKey: true, wrapIv: true },
        });
        if (
          !meta ||
          meta.cryptoVersion !== 2 ||
          meta.wrappedVaultKey !== data.currentWrappedVaultKey ||
          meta.wrapIv !== data.currentWrapIv
        ) {
          throw new VaultChangedError();
        }

        await tx.vaultMeta.update({
          where: { userId },
          data: {
            salt: data.newSalt,
            wrappedVaultKey: data.newWrappedVaultKey,
            wrapIv: data.newWrapIv,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  } catch (err) {
    const serializationFailure =
      err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034";
    if (err instanceof VaultChangedError || serializationFailure) {
      return { error: VAULT_CHANGED_ERROR };
    }
    throw err;
  }

  await db.auditLog.create({
    data: { userId, action: "vault.master_password.changed" },
  });

  revalidatePath("/vault");
  return {};
}

// ─── Sign-out all devices ─────────────────────────────────────────────────────
// JWT sessions can't be listed or deleted, so bump tokenVersion: every existing
// token fails its next version check (within 60 s) and its session ends.
// This device is signed out immediately.

export async function signOutEverywhereAction(): Promise<{ error?: string }> {
  const session = await auth();
  if (!session) return { error: "Not authenticated" };

  const reauth = await requireRecentReauth(session.user.id);
  if (!reauth.ok) return { error: reauth.error };

  await revokeAllSessions(session.user.id);
  await db.auditLog.create({
    data: { userId: session.user.id, action: "auth.sessions.revoked_all" },
  });

  // Clears this browser's session cookie and redirects (throws NEXT_REDIRECT).
  await signOut({ redirectTo: "/auth/signin" });
  return {};
}
