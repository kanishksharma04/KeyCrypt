import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { VaultLockProvider } from "@/providers/vault-lock-provider";

// Server-side auth + vault-meta guard.
// VaultLockProvider then handles the client-side "is key in memory?" check.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/auth/signin");

  const vaultMeta = await db.vaultMeta.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  // New users must create their master password before seeing the dashboard
  if (!vaultMeta) redirect("/vault/setup");

  return <VaultLockProvider>{children}</VaultLockProvider>;
}
