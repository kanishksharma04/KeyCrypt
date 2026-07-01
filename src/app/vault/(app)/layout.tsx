import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { VaultLockProvider } from "@/providers/vault-lock-provider";
import { VaultHeader } from "@/features/vault/vault-header";

export default async function VaultAppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/auth/signin");

  const vaultMeta = await db.vaultMeta.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!vaultMeta) redirect("/vault/setup");

  const displayName = session.user.name ?? session.user.email ?? "?";
  const initials = displayName.split(/[\s@]/)[0]?.[0]?.toUpperCase() ?? "?";
  const email = session.user.email ?? "";

  return (
    <VaultLockProvider>
      <div className="flex min-h-dvh flex-col">
        <VaultHeader initials={initials} email={email} />
        <main className="animate-fade-in flex-1">{children}</main>
      </div>
    </VaultLockProvider>
  );
}
