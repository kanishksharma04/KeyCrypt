import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { UnlockForm } from "@/features/vault/unlock-form";

export default async function VaultUnlockPage() {
  const session = await auth();
  if (!session) redirect("/auth/signin");

  const vaultMeta = await db.vaultMeta.findUnique({
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
      recoveryWrappedKey: true,
      recoveryIv: true,
      recoveryCreatedAt: true,
    },
  });

  // No vault configured yet — redirect to setup
  if (!vaultMeta || !vaultMeta.verificationBlob || !vaultMeta.verificationIv) {
    redirect("/vault/setup");
  }

  return (
    <UnlockForm
      userId={session.user.id}
      meta={{
        cryptoVersion: vaultMeta.cryptoVersion,
        kdf: vaultMeta.kdf,
        kdfParams: vaultMeta.kdfParams,
        salt: vaultMeta.salt,
        verificationBlob: vaultMeta.verificationBlob,
        verificationIv: vaultMeta.verificationIv,
        wrappedVaultKey: vaultMeta.wrappedVaultKey,
        wrapIv: vaultMeta.wrapIv,
        recoveryWrappedKey: vaultMeta.recoveryWrappedKey,
        recoveryIv: vaultMeta.recoveryIv,
        recoveryCreatedAt: vaultMeta.recoveryCreatedAt?.toISOString() ?? null,
      }}
    />
  );
}
