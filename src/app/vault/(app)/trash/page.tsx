import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { TRASH_RETENTION_DAYS } from "@/lib/trash-retention";
import { getTrashedItemsAction } from "@/server/vault-item-actions";
import { TrashList } from "@/features/vault/trash-list";

export const metadata: Metadata = { title: "Trash" };

export default async function TrashPage() {
  const items = await getTrashedItemsAction();
  if ("error" in items) redirect("/auth/signin");

  return (
    <div className="mx-auto max-w-[1120px] space-y-6 px-4 py-6 sm:p-7">
      <PageHeader
        heading="Trash"
        subheading={`Deleted items stay here for ${TRASH_RETENTION_DAYS} days. Restore them, or delete them forever.`}
      />
      <TrashList items={items} />
    </div>
  );
}
