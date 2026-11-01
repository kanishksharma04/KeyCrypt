"use server";

import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireRecentReauth } from "@/lib/reauth";
import { VAULT_CHANGED_ERROR } from "@/lib/action-errors";
import { INVALID_INPUT, setupVaultInput, upgradeVaultInput } from "@/schemas/server";

/** Everything the browser needs to unlock (all opaque to the server). */
export interface VaultMetaForUnlock {
  cryptoVersion: number;
  /** "pbkdf2" | "argon2id"; validated in the browser by parseKdfConfig(). */
  kdf: string;
  kdfParams: unknown;
  salt: string;
  verificationBlob: string;
  verificationIv: string;
  wrappedVaultKey: string | null;
  wrapIv: string | null;
}

/** Create a new vault (always crypto v2). */
export async function setupVaultAction(input: {
  kdf: "argon2id";
  kdfParams: { memoryKiB: number; iterations: number; parallelism: number; hashLength: 32 };
  salt: string;
  wrappedVaultKey: string;
  wrapIv: string;
  verificationBlob: string;
  verificationIv: string;
}): Promise<{ error: string } | null> {
  const parsed = setupVaultInput.safeParse(input);
  if (!parsed.success) return { error: INVALID_INPUT };
  const data = parsed.data;

  const session = await auth();
  if (!session) return { error: "Not authenticated" };

  const userId = session.user.id;

  const existing = await db.vaultMeta.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (existing) return { error: "Vault already configured" };

  await db.vaultMeta.create({
    data: {
      userId,
      cryptoVersion: 2,
      kdf: data.kdf,
      kdfParams: data.kdfParams,
      salt: data.salt,
      wrappedVaultKey: data.wrappedVaultKey,
      wrapIv: data.wrapIv,
      verificationBlob: data.verificationBlob,
      verificationIv: data.verificationIv,
    },
  });

  await db.auditLog.create({
    data: { userId, action: "vault.setup", metadata: { cryptoVersion: 2 } },
  });

  return null;
}

export async function getVaultMetaAction(): Promise<VaultMetaForUnlock | null> {
  const session = await auth();
  if (!session) return null;

  const meta = await db.vaultMeta.findUnique({
    where: { userId: session.user.id },
    select: {
      cryptoVersion: true,
      kdf: true,
      kdfParams: true,
      salt: true,
      verificationBlob: true,
      verificationIv: true,
      wrappedVaultKey: true,
      wrapIv: true,
    },
  });

  if (!meta?.verificationBlob || !meta.verificationIv) return null;

  return {
    cryptoVersion: meta.cryptoVersion,
    kdf: meta.kdf,
    kdfParams: meta.kdfParams,
    salt: meta.salt,
    verificationBlob: meta.verificationBlob,
    verificationIv: meta.verificationIv,
    wrappedVaultKey: meta.wrappedVaultKey,
    wrapIv: meta.wrapIv,
  };
}

/** Thrown inside the transaction to roll back after writes have started. */
class VaultChangedError extends Error {}

/**
 * One-time v1 → v2 upgrade, run by the browser right after a v1 unlock: every
 * item re-encrypted under a new random vault key, which is stored wrapped.
 *
 * Like a master-password change it rewrites all key material, so it needs a
 * recent account-password confirmation (a stolen session alone must not be able
 * to replace the vault with junk), the current v1 verifier, and EXACTLY the
 * current item set (KC-18). Serializable isolation aborts on concurrent edits.
 */
export async function upgradeVaultAction(input: {
  currentVerificationBlob: string;
  currentVerificationIv: string;
  kdf: "argon2id";
  kdfParams: { memoryKiB: number; iterations: number; parallelism: number; hashLength: 32 };
  newSalt: string;
  wrappedVaultKey: string;
  wrapIv: string;
  newVerificationBlob: string;
  newVerificationIv: string;
  items: { id: string; ciphertext: string; iv: string }[];
}): Promise<{ error?: string }> {
  const parsed = upgradeVaultInput.safeParse(input);
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
          select: { cryptoVersion: true, verificationBlob: true, verificationIv: true },
        });
        if (
          !meta ||
          meta.cryptoVersion !== 1 ||
          meta.verificationBlob !== data.currentVerificationBlob ||
          meta.verificationIv !== data.currentVerificationIv
        ) {
          throw new VaultChangedError();
        }

        const existing = await tx.vaultItem.findMany({ where: { userId }, select: { id: true } });
        const submitted = new Set(data.items.map((i) => i.id));
        const exactMatch =
          submitted.size === data.items.length &&
          submitted.size === existing.length &&
          existing.every((e) => submitted.has(e.id));
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
            cryptoVersion: 2,
            kdf: data.kdf,
            kdfParams: data.kdfParams,
            salt: data.newSalt,
            wrappedVaultKey: data.wrappedVaultKey,
            wrapIv: data.wrapIv,
            verificationBlob: data.newVerificationBlob,
            verificationIv: data.newVerificationIv,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60_000 }
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
    data: { userId, action: "vault.upgraded", metadata: { cryptoVersion: 2 } },
  });
  return {};
}
