"use client";

import { useState, useTransition } from "react";
import { Check, FolderPlus, Loader2, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { generateItemId, getVaultKey } from "@/lib/crypto";
import {
  createFolderAction,
  deleteFolderAction,
  moveItemToFolderAction,
  renameFolderAction,
} from "@/server/folder-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useVaultUserId } from "@/providers/vault-user-provider";
import type { DecryptedFolder } from "@/types/vault";
import { sealFolderName } from "./folder-payload";

const MAX_NAME = 100;

export const SELECT_CLASS =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

function validName(name: string): string | null {
  const n = name.trim();
  if (!n) return "Enter a folder name.";
  if (n.length > MAX_NAME) return `Max ${MAX_NAME} characters.`;
  return null;
}

/** Encrypt a folder name in the browser, for a new or renamed folder. */
async function sealedName(id: string, name: string, userId: string) {
  const key = getVaultKey();
  if (!key) throw new Error("Vault is locked. Unlock it and try again.");
  return sealFolderName(key, { id, name: name.trim() }, userId);
}

// ─── Manage folders ──────────────────────────────────────────────────────────

function FolderRowEditor({ folder }: { folder: DecryptedFolder }) {
  const userId = useVaultUserId();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [name, setName] = useState(folder.name);
  const [isPending, startTransition] = useTransition();

  function rename() {
    const problem = validName(name);
    if (problem) return void toast.error(problem);
    startTransition(async () => {
      try {
        const result = await renameFolderAction({
          id: folder.id,
          ...(await sealedName(folder.id, name, userId)),
        });
        if (result.error) return void toast.error(result.error);
        setEditing(false);
        toast.success("Folder renamed");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't rename the folder.");
      }
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteFolderAction(folder.id);
      if (result.error) return void toast.error(result.error);
      toast.success("Folder deleted; its items are now unfiled");
    });
  }

  if (editing) {
    return (
      <li className="flex items-center gap-2">
        <Input
          aria-label={`New name for ${folder.name}`}
          value={name}
          maxLength={MAX_NAME}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), rename())}
        />
        <Button size="icon-sm" onClick={rename} disabled={isPending} aria-label="Save name">
          {isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Check className="size-3.5" />
          )}
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() => (setEditing(false), setName(folder.name))}
          aria-label="Cancel rename"
        >
          <X className="size-3.5" />
        </Button>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-2">
      <span className="flex-1 truncate text-sm">{folder.name}</span>
      {confirmDelete ? (
        <>
          <Button size="sm" variant="destructive" onClick={remove} disabled={isPending}>
            Delete {folder.name}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
            Keep
          </Button>
        </>
      ) : (
        <>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => setEditing(true)}
            aria-label={`Rename ${folder.name}`}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => setConfirmDelete(true)}
            aria-label={`Delete ${folder.name}`}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </>
      )}
    </li>
  );
}

export function ManageFoldersDialog({
  open,
  onOpenChange,
  folders,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folders: DecryptedFolder[];
}) {
  const userId = useVaultUserId();
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();

  function create(e: React.FormEvent) {
    e.preventDefault();
    const problem = validName(name);
    if (problem) return void toast.error(problem);
    startTransition(async () => {
      try {
        // The id exists before encryption so it can be bound into the AAD.
        const id = generateItemId();
        const result = await createFolderAction({ id, ...(await sealedName(id, name, userId)) });
        if ("error" in result) return void toast.error(result.error);
        setName("");
        toast.success("Folder created");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't create the folder.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Folders</DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground text-xs">
          Folder names are encrypted in this browser, like your items.
        </p>
        <form onSubmit={create} className="flex gap-2">
          <Input
            aria-label="New folder name"
            placeholder="New folder"
            value={name}
            maxLength={MAX_NAME}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" size="sm" disabled={isPending || !name.trim()}>
            {isPending ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <FolderPlus className="size-3.5" aria-hidden="true" />
            )}
            Add
          </Button>
        </form>
        {folders.length === 0 ? (
          <p className="text-muted-foreground text-sm">No folders yet.</p>
        ) : (
          <ul className="max-h-72 space-y-1 overflow-y-auto" aria-label="Folders">
            {folders.map((f) => (
              <FolderRowEditor key={`${f.id}:${f.name}`} folder={f} />
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Move an item ────────────────────────────────────────────────────────────

export function MoveItemDialog({
  item,
  folders,
  onOpenChange,
}: {
  item: { id: string; name: string; folderId?: string | null } | null;
  folders: DecryptedFolder[];
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={!!item} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xs">
        {item && <MoveItemForm item={item} folders={folders} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function MoveItemForm({
  item,
  folders,
  onDone,
}: {
  item: { id: string; name: string; folderId?: string | null };
  folders: DecryptedFolder[];
  onDone: () => void;
}) {
  const [target, setTarget] = useState(item.folderId ?? "");
  const [isPending, startTransition] = useTransition();

  function move() {
    startTransition(async () => {
      const result = await moveItemToFolderAction({ itemId: item.id, folderId: target || null });
      if (result.error) return void toast.error(result.error);
      toast.success(target ? "Item moved" : "Item removed from its folder");
      onDone();
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="truncate">Move “{item.name}”</DialogTitle>
      </DialogHeader>
      <label htmlFor="move-folder" className="text-sm font-medium">
        Folder
      </label>
      <select
        id="move-folder"
        className={`${SELECT_CLASS} w-full`}
        value={target}
        onChange={(e) => setTarget(e.target.value)}
      >
        <option value="">No folder</option>
        {folders.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
      <DialogFooter>
        <Button onClick={move} disabled={isPending || target === (item.folderId ?? "")}>
          {isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
          Move
        </Button>
      </DialogFooter>
    </>
  );
}
