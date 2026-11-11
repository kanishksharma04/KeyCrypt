import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { VaultList } from "@/features/vault/vault-list";
import type { VaultItemRow, VaultItemType } from "@/types/vault";

const VALID_TYPES: VaultItemType[] = [
  "LOGIN",
  "SECURE_NOTE",
  "API_KEY",
  "WIFI_PASSWORD",
  "OTP_SECRET",
];

export default async function VaultPage({
  searchParams,
}: {
  searchParams: Promise<{ open?: string; new?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/auth/signin");

  const params = await searchParams;
  const initialOpenId = params.open;
  const initialNewType = VALID_TYPES.includes(params.new as VaultItemType)
    ? (params.new as VaultItemType)
    : undefined;

  const rawItems = await db.vaultItem.findMany({
    // Items in Trash are listed only on /vault/trash.
    where: { userId: session.user.id, deletedAt: null },
    select: {
      id: true,
      type: true,
      name: true,
      ciphertext: true,
      iv: true,
      favorite: true,
      folderId: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ favorite: "desc" }, { updatedAt: "desc" }],
  });

  // Folder names are ciphertext here; the browser decrypts them.
  const folders = await db.folder.findMany({
    where: { userId: session.user.id },
    select: { id: true, nameCiphertext: true, nameIv: true },
    orderBy: { createdAt: "asc" },
  });

  // Serialize Date → ISO string so props are safely passed to Client Component
  const items: VaultItemRow[] = rawItems.map((item) => ({
    id: item.id,
    type: item.type,
    name: item.name,
    ciphertext: item.ciphertext,
    iv: item.iv,
    favorite: item.favorite,
    folderId: item.folderId,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  }));

  return (
    <div className="mx-auto max-w-[1120px] px-4 py-6 sm:p-7">
      <VaultList
        items={items}
        folders={folders}
        initialOpenId={initialOpenId}
        initialNewType={initialNewType}
      />
    </div>
  );
}
