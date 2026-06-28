import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { UnlockForm } from "@/features/vault/unlock-form";

export default async function VaultUnlockPage() {
  const session = await auth();
  if (!session) redirect("/auth/signin");

  const vaultMeta = await db.vaultMeta.findUnique({
    where: { userId: session.user.id },
    select: { salt: true, verificationBlob: true, verificationIv: true },
  });

  // No vault configured yet — redirect to setup
  if (!vaultMeta || !vaultMeta.verificationBlob || !vaultMeta.verificationIv) {
    redirect("/vault/setup");
  }

  return (
    <UnlockForm
      salt={vaultMeta.salt}
      verificationBlob={vaultMeta.verificationBlob}
      verificationIv={vaultMeta.verificationIv}
    />
  );
}
