import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { VaultLockProvider } from "@/providers/vault-lock-provider";
import { VaultUserProvider } from "@/providers/vault-user-provider";
import { CommandPaletteProvider } from "@/providers/command-palette-provider";
import { VaultHeader } from "@/features/vault/vault-header";
import { CommandPalette } from "@/features/vault/command-palette";

export default async function VaultAppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/auth/signin");

  const vaultMeta = await db.vaultMeta.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!vaultMeta) redirect("/vault/setup");

  // "Kanishk Sharma" → "KS"; without a name, the email's first letter.
  const nameWords = (session.user.name ?? "").trim().split(/\s+/).filter(Boolean);
  const initials =
    (nameWords.length > 1
      ? `${nameWords[0]?.[0] ?? ""}${nameWords.at(-1)?.[0] ?? ""}`
      : (nameWords[0] ?? session.user.email ?? "?").slice(0, 1)
    ).toUpperCase() || "?";
  const email = session.user.email ?? "";

  return (
    <VaultUserProvider userId={session.user.id}>
      <CommandPaletteProvider>
        <VaultLockProvider>
          <div className="flex min-h-dvh flex-col">
            <VaultHeader initials={initials} email={email} />
            <main className="animate-fade-in flex-1">{children}</main>
            <CommandPalette />
          </div>
        </VaultLockProvider>
      </CommandPaletteProvider>
    </VaultUserProvider>
  );
}
