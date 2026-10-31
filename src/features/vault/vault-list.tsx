"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, Plus, Star } from "lucide-react";
import { toast } from "sonner";
import { deleteVaultItemAction } from "@/server/vault-item-actions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoginItemDialog } from "./login-item-dialog";
import { SecureNoteDialog } from "./secure-note-dialog";
import { ApiKeyDialog } from "./api-key-dialog";
import { WifiPasswordDialog } from "./wifi-password-dialog";
import { useDecryptedItems } from "./use-decrypted-items";
import { VaultToolbar, filterVaultItems } from "./vault-toolbar";
import { VaultItemRow } from "./vault-item-row";
import { ViewItemDialog } from "./view-item-dialog";
import type {
  DecryptedVaultItem,
  VaultItemRow as VaultItemRowData,
  VaultItemType,
} from "@/types/vault";

// ─── VaultList ────────────────────────────────────────────────────────────────

interface VaultListProps {
  items: VaultItemRowData[];
  initialOpenId?: string;
  initialNewType?: VaultItemType;
}

type CreateType = VaultItemType | null;

export function VaultList({ items, initialOpenId, initialNewType }: VaultListProps) {
  const router = useRouter();
  const { decrypted, loading } = useDecryptedItems(items);
  const [search, setSearch] = useState("");
  const [createType, setCreateType] = useState<CreateType>(initialNewType ?? null);
  const [favOnly, setFavOnly] = useState(false);
  const [viewItem, setViewItem] = useState<DecryptedVaultItem | null>(null);
  const [editItem, setEditItem] = useState<DecryptedVaultItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [isPendingDelete, startDeleteTransition] = useTransition();

  // Deep-link support for the command palette and vault health score links
  // (/vault?open=<id>, /vault?new=<type>) — consume once, then strip from the URL.
  useEffect(() => {
    if (!initialOpenId && !initialNewType) return;
    if (initialOpenId) {
      const match = decrypted.find((item) => item.id === initialOpenId);
      if (!match) {
        if (loading) return; // wait for decryption to finish before giving up
      } else {
        queueMicrotask(() => setViewItem(match));
      }
    }
    router.replace("/vault");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOpenId, initialNewType, decrypted, loading]);

  const filtered = filterVaultItems(decrypted, search, favOnly);

  function handleConfirmDelete() {
    if (!deleteTarget) return;
    const { id } = deleteTarget;
    startDeleteTransition(async () => {
      const result = await deleteVaultItemAction(id);
      if (result.error) toast.error(result.error);
      else toast.success("Item deleted");
      setDeleteTarget(null);
    });
  }

  return (
    <div className="space-y-4">
      <VaultToolbar
        search={search}
        onSearchChange={setSearch}
        favOnly={favOnly}
        onFavOnlyChange={setFavOnly}
        onCreate={setCreateType}
        loading={loading}
        filteredCount={filtered.length}
        totalCount={decrypted.length}
      />

      {/* List */}
      {loading ? (
        <div className="space-y-2" aria-label="Loading vault items">
          {Array.from({ length: Math.min(Math.max(items.length, 1), 8) }, (_, i) => (
            <Skeleton key={i} className="h-15 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        !search && !favOnly ? (
          <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed py-20 text-center">
            <div className="bg-primary/10 flex size-16 items-center justify-center rounded-2xl">
              <KeyRound className="text-primary size-8" aria-hidden="true" />
            </div>
            <div className="space-y-1.5">
              <p className="text-base font-semibold">Your vault is empty</p>
              <p className="text-muted-foreground mx-auto max-w-xs text-sm">
                Add your first item to start encrypting your digital life.
              </p>
            </div>
            <Button onClick={() => setCreateType("LOGIN")}>
              <Plus className="size-4" aria-hidden="true" />
              Add your first login
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
            <div className="bg-muted flex size-12 items-center justify-center rounded-xl">
              {favOnly && !search ? (
                <Star className="text-muted-foreground size-5" aria-hidden="true" />
              ) : (
                <KeyRound className="text-muted-foreground size-5" aria-hidden="true" />
              )}
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {search ? "No items match your search" : "No favorites yet"}
              </p>
              <p className="text-muted-foreground text-xs">
                {search ? "Try a different search term" : "Star any item to pin it here"}
              </p>
            </div>
            {favOnly && !search && (
              <Button size="sm" variant="outline" onClick={() => setFavOnly(false)}>
                Show all items
              </Button>
            )}
          </div>
        )
      ) : (
        <div className="space-y-2">
          {filtered.map((item, i) => (
            <div
              key={item.id}
              className="animate-fade-in-up"
              style={{ animationDelay: `${Math.min(i * 35, 210)}ms` }}
            >
              <VaultItemRow
                item={item}
                onView={() => setViewItem(item)}
                onEdit={() => setEditItem(item)}
                onDelete={() => setDeleteTarget({ id: item.id, name: item.name })}
              />
            </div>
          ))}
        </div>
      )}

      {/* ── View dialog ────────────────────────────────────────────────────── */}
      <ViewItemDialog
        item={viewItem}
        onOpenChange={(open) => {
          if (!open) setViewItem(null);
        }}
      />

      {/* ── Create dialogs ──────────────────────────────────────────────────── */}
      <LoginItemDialog
        open={createType === "LOGIN"}
        onOpenChange={(o) => {
          if (!o) setCreateType(null);
        }}
        mode="create"
      />
      <SecureNoteDialog
        open={createType === "SECURE_NOTE"}
        onOpenChange={(o) => {
          if (!o) setCreateType(null);
        }}
        mode="create"
      />
      <ApiKeyDialog
        open={createType === "API_KEY"}
        onOpenChange={(o) => {
          if (!o) setCreateType(null);
        }}
        mode="create"
      />
      <WifiPasswordDialog
        open={createType === "WIFI_PASSWORD"}
        onOpenChange={(o) => {
          if (!o) setCreateType(null);
        }}
        mode="create"
      />

      {/* ── Edit dialogs (always rendered, open toggled by editItem type) ─── */}
      <LoginItemDialog
        open={editItem?.type === "LOGIN"}
        onOpenChange={(o) => {
          if (!o) setEditItem(null);
        }}
        mode="edit"
        itemId={editItem?.id}
        initialValues={
          editItem?.type === "LOGIN" ? { name: editItem.name, ...editItem.secret } : undefined
        }
      />
      <SecureNoteDialog
        open={editItem?.type === "SECURE_NOTE"}
        onOpenChange={(o) => {
          if (!o) setEditItem(null);
        }}
        mode="edit"
        itemId={editItem?.id}
        initialValues={
          editItem?.type === "SECURE_NOTE" ? { name: editItem.name, ...editItem.secret } : undefined
        }
      />
      <ApiKeyDialog
        open={editItem?.type === "API_KEY"}
        onOpenChange={(o) => {
          if (!o) setEditItem(null);
        }}
        mode="edit"
        itemId={editItem?.id}
        initialValues={
          editItem?.type === "API_KEY" ? { name: editItem.name, ...editItem.secret } : undefined
        }
      />
      <WifiPasswordDialog
        open={editItem?.type === "WIFI_PASSWORD"}
        onOpenChange={(o) => {
          if (!o) setEditItem(null);
        }}
        mode="edit"
        itemId={editItem?.id}
        initialValues={
          editItem?.type === "WIFI_PASSWORD"
            ? { name: editItem.name, ...editItem.secret }
            : undefined
        }
      />

      {/* ── Delete confirmation ─────────────────────────────────────────────── */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Delete item?</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            <strong>{deleteTarget?.name}</strong> will be permanently deleted. This cannot be
            undone.
          </p>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirmDelete}
              disabled={isPendingDelete}
            >
              {isPendingDelete && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
