import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { VaultList } from "@/features/vault/vault-list";
import type { VaultItemRow } from "@/types/vault";

export default async function VaultPage() {
  const session = await auth();
  if (!session) redirect("/auth/signin");

  const rawItems = await db.vaultItem.findMany({
    where: { userId: session.user.id },
    select: {
      id: true,
      type: true,
      name: true,
      ciphertext: true,
      iv: true,
      favorite: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ favorite: "desc" }, { updatedAt: "desc" }],
  });

  // Serialize Date → ISO string so props are safely passed to Client Component
  const items: VaultItemRow[] = rawItems.map((item) => ({
    id: item.id,
    type: item.type,
    name: item.name,
    ciphertext: item.ciphertext,
    iv: item.iv,
    favorite: item.favorite,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  }));

  return (
    <div className="container mx-auto max-w-3xl px-4 py-6">
      <VaultList items={items} />
    </div>
  );
}
