"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { relativeTime } from "@/lib/relative-time";
import { daysUntilPurge, TRASH_RETENTION_DAYS } from "@/lib/trash-retention";
import { purgeVaultItemAction, restoreVaultItemAction } from "@/server/vault-item-actions";
import type { VaultItemRow } from "@/types/vault";
import { useDecryptedItems } from "./use-decrypted-items";
import { TYPE_META } from "./vault-item-types";

export type TrashedItemRow = VaultItemRow & { deletedAt: string };

/**
 * Items in Trash: names decrypted in the browser, with Restore and "Delete
 * forever". The server purges anything trashed more than TRASH_RETENTION_DAYS ago.
 */
export function TrashList({ items, now }: { items: TrashedItemRow[]; now?: number }) {
  const router = useRouter();
  const { decrypted, loading } = useDecryptedItems(items);
  const deletedAt = useMemo(() => new Map(items.map((i) => [i.id, i.deletedAt])), [items]);
  // When the page rendered: fixes the "N days left" figures for this view.
  const [renderedAt] = useState(() => now ?? Date.now());
  const [purgeTarget, setPurgeTarget] = useState<{ id: string; name: string } | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(id: string, action: () => Promise<{ error?: string }>, success: string) {
    setPendingId(id);
    startTransition(async () => {
      const result = await action();
      if (result.error) toast.error(result.error);
      else toast.success(success);
      setPendingId(null);
      setPurgeTarget(null);
      router.refresh();
    });
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Trash2}
        heading="Trash is empty"
        description={`Items you delete stay here for ${TRASH_RETENTION_DAYS} days, then they're deleted for good.`}
      />
    );
  }

  if (loading) {
    return (
      <p className="text-muted-foreground text-sm" role="status">
        Decrypting…
      </p>
    );
  }

  return (
    <>
      <ul className="bg-card divide-y rounded-xl border" aria-label="Items in Trash">
        {decrypted.map((item) => {
          const meta = TYPE_META[item.type];
          const trashedAt = deletedAt.get(item.id) ?? item.updatedAt;
          const days = daysUntilPurge(new Date(trashedAt), new Date(renderedAt));
          const busy = isPending && pendingId === item.id;
          return (
            <li key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5">
              <div
                className={`${meta.iconBg} flex size-[38px] shrink-0 items-center justify-center rounded-[10px]`}
              >
                <meta.Icon className={`${meta.iconColor} size-[18px]`} aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14.5px] font-semibold">{item.name}</p>
                <p className="text-muted-foreground text-[12.5px]">
                  {meta.label} · moved to Trash{" "}
                  {relativeTime(trashedAt, {
                    now: renderedAt,
                    style: "long",
                    longAgo: "ago",
                  }).toLowerCase()}{" "}
                  ·{" "}
                  {days === 0
                    ? "deleted forever today"
                    : `deleted forever in ${days} day${days === 1 ? "" : "s"}`}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    run(item.id, () => restoreVaultItemAction(item.id), `Restored ${item.name}`)
                  }
                  aria-label={`Restore ${item.name}`}
                >
                  <RotateCcw className="size-3.5" aria-hidden="true" />
                  Restore
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={busy}
                  onClick={() => setPurgeTarget({ id: item.id, name: item.name })}
                  aria-label={`Delete ${item.name} forever`}
                >
                  Delete forever
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <Dialog
        open={!!purgeTarget}
        onOpenChange={(open) => {
          if (!open) setPurgeTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Delete forever?</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            <strong>{purgeTarget?.name}</strong> will be permanently deleted. This can&apos;t be
            undone.
          </p>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
            <Button
              variant="destructive"
              size="sm"
              disabled={isPending}
              onClick={() => {
                if (!purgeTarget) return;
                const { id, name } = purgeTarget;
                run(id, () => purgeVaultItemAction(id), `${name} deleted forever`);
              }}
            >
              {isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
              Delete forever
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
