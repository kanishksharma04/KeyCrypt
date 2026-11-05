"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  LayoutDashboard,
  Lock,
  Moon,
  Settings as SettingsIcon,
  Sun,
  Vault,
  Folder as FolderIcon,
} from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useCommandPalette } from "@/providers/command-palette-provider";
import { useVaultLock } from "@/providers/vault-lock-provider";
import { getVaultItemSummariesAction } from "@/server/vault-item-actions";
import { getVaultKey } from "@/lib/crypto";
import { useVaultUserId } from "@/providers/vault-user-provider";
import { openItem } from "./item-payload";
import { decryptFolders } from "./folder-payload";
import { TYPE_META } from "./vault-item-types";
import { getFoldersAction } from "@/server/folder-actions";
import type { DecryptedFolder } from "@/types/vault";
import type { VaultItemType } from "@/types/vault";

interface ItemSummary {
  id: string;
  type: VaultItemType;
  name: string;
  favorite: boolean;
  /** Decrypted folder name, so typing a folder's name finds its items. */
  folderName?: string | undefined;
}

/** Favourites first, then by name (A–Z, case-insensitive). */
function compareItems(a: ItemSummary, b: ItemSummary): number {
  if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

export function CommandPalette() {
  const userId = useVaultUserId();
  const { isOpen, close } = useCommandPalette();
  const { lock } = useVaultLock();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [items, setItems] = useState<ItemSummary[]>([]);
  const [folders, setFolders] = useState<DecryptedFolder[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Load the item list lazily on first open. Names are encrypted (crypto v2):
  // the server returns ciphertext, and the names are decrypted, sorted and
  // fuzzy-searched (cmdk) here in the browser.
  useEffect(() => {
    if (!isOpen || loaded) return;
    const key = getVaultKey();
    if (!key) return;
    void Promise.all([getVaultItemSummariesAction(), getFoldersAction()]).then(
      async ([res, folderRows]) => {
        const decryptedFolders =
          "error" in folderRows ? [] : await decryptFolders(key, folderRows, userId);
        const folderNames = new Map(decryptedFolders.map((f) => [f.id, f.name]));
        if (!("error" in res)) {
          const opened = await Promise.all(
            res.map(async (row): Promise<ItemSummary | null> => {
              try {
                const { name } = await openItem(key, row, userId);
                return {
                  id: row.id,
                  type: row.type,
                  name,
                  favorite: row.favorite,
                  folderName: row.folderId ? folderNames.get(row.folderId) : undefined,
                };
              } catch {
                return null; // unreadable rows are left out of the palette
              }
            })
          );
          setItems(opened.filter((i): i is ItemSummary => i !== null).sort(compareItems));
        }
        setFolders(decryptedFolders);
        setLoaded(true);
      }
    );
  }, [isOpen, loaded, userId]);

  function run(action: () => void) {
    close();
    action();
  }

  return (
    <CommandDialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <Command>
        <CommandInput placeholder="Search items or run a command…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          <CommandGroup heading="Quick actions">
            {(
              Object.entries(TYPE_META) as [VaultItemType, (typeof TYPE_META)[VaultItemType]][]
            ).map(([type, { Icon, label }]) => (
              <CommandItem key={type} onSelect={() => run(() => router.push(`/vault?new=${type}`))}>
                <Icon aria-hidden="true" />
                New {label.toLowerCase()}
              </CommandItem>
            ))}
            <CommandItem onSelect={() => run(() => router.push("/vault"))}>
              <Vault aria-hidden="true" />
              Go to vault
            </CommandItem>
            <CommandItem onSelect={() => run(() => router.push("/vault/dashboard"))}>
              <LayoutDashboard aria-hidden="true" />
              Go to dashboard
            </CommandItem>
            <CommandItem onSelect={() => run(() => router.push("/vault/settings"))}>
              <SettingsIcon aria-hidden="true" />
              Go to settings
            </CommandItem>
            <CommandItem onSelect={() => run(() => setTheme(theme === "dark" ? "light" : "dark"))}>
              {theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
              Toggle theme
            </CommandItem>
            <CommandItem onSelect={() => run(lock)}>
              <Lock aria-hidden="true" />
              Lock vault
            </CommandItem>
          </CommandGroup>

          {folders.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Folders">
                {folders.map((folder) => (
                  <CommandItem
                    key={folder.id}
                    value={`Show folder: ${folder.name}`}
                    keywords={["folder", folder.name]}
                    onSelect={() =>
                      run(() => router.push(`/vault?folder=${encodeURIComponent(folder.id)}`))
                    }
                  >
                    <FolderIcon aria-hidden="true" />
                    Show folder: {folder.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {items.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Vault items">
                {items.map((item) => {
                  const { Icon } = TYPE_META[item.type];
                  return (
                    <CommandItem
                      key={item.id}
                      value={item.name}
                      keywords={item.folderName ? [item.folderName] : undefined}
                      onSelect={() => run(() => router.push(`/vault?open=${item.id}`))}
                    >
                      <Icon aria-hidden="true" />
                      {item.name}
                      {item.folderName && (
                        <span className="text-muted-foreground ml-auto truncate text-xs">
                          {item.folderName}
                        </span>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
