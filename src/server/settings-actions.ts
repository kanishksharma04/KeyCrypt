"use server";

import { revalidatePath } from "next/cache";
import { auth, signOut } from "@/lib/auth";
import { revokeAllSessions } from "@/lib/session-version";
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

/** Thrown inside the transaction to roll back after writes have started. */
class VaultChangedError extends Error {}

export async function changeMasterPasswordAction(input: {
  currentVerificationBlob: string;
  currentVerificationIv: string;
  newSalt: string;
  newVerificationBlob: string;
  newVerificationIv: string;
  items: { id: string; ciphertext: string; iv: string }[];
}): Promise<{ error?: string }> {
  const parsed = changeMasterPasswordInput.safeParse(input);
  if (!parsed.success) return { error: INVALID_INPUT };
  const data = parsed.data;

  const session = await auth();
  if (!session) return { error: "Not authenticated" };

  const userId = session.user.id;

  // Re-keying is all-or-nothing. Any item left under the old key would be
  // unreadable forever (its salt is about to be replaced), so the client must
  // prove it read the current verifier and must submit EVERY item, exactly once.
  //
  // Serializable isolation makes Postgres abort this transaction if another
  // request adds, removes or rewrites this user's items or VaultMeta meanwhile.
  try {
    await db.$transaction(
      async (tx) => {
        const meta = await tx.vaultMeta.findUnique({
          where: { userId },
          select: { verificationBlob: true, verificationIv: true },
        });
        if (
          !meta ||
          meta.verificationBlob !== data.currentVerificationBlob ||
          meta.verificationIv !== data.currentVerificationIv
        ) {
          throw new VaultChangedError();
        }

        const existing = await tx.vaultItem.findMany({ where: { userId }, select: { id: true } });
        const submitted = new Set(data.items.map((i) => i.id));
        const exactMatch =
          submitted.size === data.items.length && // no duplicates
          submitted.size === existing.length && // nothing missing or extra…
          existing.every((e) => submitted.has(e.id)); // …and the same ids
        if (!exactMatch) throw new VaultChangedError();

        for (const item of data.items) {
          const { count } = await tx.vaultItem.updateMany({
            where: { id: item.id, userId },
            data: { ciphertext: item.ciphertext, iv: item.iv },
          });
          if (count !== 1) throw new VaultChangedError();
        }

        await tx.vaultMeta.update({
          where: { userId },
          data: {
            salt: data.newSalt,
            verificationBlob: data.newVerificationBlob,
            verificationIv: data.newVerificationIv,
          },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        // Up to 5,000 sequential item updates.
        timeout: 60_000,
      }
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

  await revokeAllSessions(session.user.id);
  await db.auditLog.create({
    data: { userId: session.user.id, action: "auth.sessions.revoked_all" },
  });

  // Clears this browser's session cookie and redirects (throws NEXT_REDIRECT).
  await signOut({ redirectTo: "/auth/signin" });
  return {};
}
