import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { SetupMasterPasswordForm } from "@/features/vault/setup-master-password-form";

export default async function VaultSetupPage() {
  const session = await auth();
  if (!session) redirect("/auth/signin");

  // If vault is already configured, skip to unlock
  const existing = await db.vaultMeta.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (existing) redirect("/vault/unlock");

  return <SetupMasterPasswordForm />;
}
