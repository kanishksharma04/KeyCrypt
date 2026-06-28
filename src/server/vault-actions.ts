"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function setupVaultAction(data: {
  salt: string;
  verificationBlob: string;
  verificationIv: string;
}): Promise<{ error: string } | null> {
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
      salt: data.salt,
      verificationBlob: data.verificationBlob,
      verificationIv: data.verificationIv,
    },
  });

  await db.auditLog.create({
    data: { userId, action: "vault.setup" },
  });

  return null;
}

export async function getVaultMetaAction(): Promise<{
  salt: string;
  verificationBlob: string;
  verificationIv: string;
} | null> {
  const session = await auth();
  if (!session) return null;

  const meta = await db.vaultMeta.findUnique({
    where: { userId: session.user.id },
    select: { salt: true, verificationBlob: true, verificationIv: true },
  });

  if (!meta?.verificationBlob || !meta.verificationIv) return null;

  return {
    salt: meta.salt,
    verificationBlob: meta.verificationBlob,
    verificationIv: meta.verificationIv,
  };
}
