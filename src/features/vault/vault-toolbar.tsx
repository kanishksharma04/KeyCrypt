"use client";

import { useEffect, useRef } from "react";
import { Plus, Star, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DecryptedVaultItem, VaultItemType } from "@/types/vault";
import { TYPE_META } from "./vault-item-meta";
import { cn } from "@/lib/utils";

/**
 * Items matching the favourites filter and the search query. Search covers the
 * item name, a login's username and URL, and a WiFi network's SSID.
 */
export function filterVaultItems(
  items: DecryptedVaultItem[],
  search: string,
  favOnly: boolean,
  /** "all", "none" (unfiled) or a folder id. */
  folder: string = "all"
): DecryptedVaultItem[] {
  return items.filter((item) => {
    if (favOnly && !item.favorite) return false;
    if (folder === "none" && item.folderId) return false;
    if (folder !== "all" && folder !== "none" && item.folderId !== folder) return false;
    const q = search.toLowerCase();
    if (!q) return true;
    if (item.name.toLowerCase().includes(q)) return true;
    if (item.type === "LOGIN")
      return (
        item.secret.username.toLowerCase().includes(q) || item.secret.url.toLowerCase().includes(q)
      );
    if (item.type === "WIFI_PASSWORD") return item.secret.ssid.toLowerCase().includes(q);
    if (item.type === "OTP_SECRET")
      return (
        item.secret.issuer.toLowerCase().includes(q) ||
        item.secret.account.toLowerCase().includes(q)
      );
    return false;
  });
}

interface VaultToolbarProps {
  search: string;
  onSearchChange: (search: string) => void;
  favOnly: boolean;
  onFavOnlyChange: (favOnly: boolean) => void;
  onCreate: (type: VaultItemType) => void;
  loading: boolean;
  filteredCount: number;
  totalCount: number;
}

/** Favourites filter, search, "New item" menu and the item-count line. */
export function VaultToolbar({
  search,
  onSearchChange,
  favOnly,
  onFavOnlyChange,
  onCreate,
  loading,
  filteredCount,
  totalCount,
}: VaultToolbarProps) {
  const searchRef = useRef<HTMLInputElement>(null);

  // "/" focuses search; Escape in search clears it.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape" && document.activeElement === searchRef.current) {
        onSearchChange("");
        searchRef.current?.blur();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onSearchChange]);

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <Button
          variant={favOnly ? "default" : "outline"}
          size="icon-sm"
          onClick={() => onFavOnlyChange(!favOnly)}
          title={favOnly ? "Show all items" : "Show favorites only"}
        >
          <Star className={cn("size-3.5", favOnly && "fill-current")} aria-hidden="true" />
          <span className="sr-only">Filter favorites</span>
        </Button>
        <div className="group relative max-w-xs flex-1">
          <Input
            ref={searchRef}
            placeholder="Search items…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pr-8"
            aria-label="Search vault items"
          />
          {search ? (
            <button
              onClick={() => onSearchChange("")}
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          ) : (
            <kbd className="bg-muted text-muted-foreground pointer-events-none absolute top-1/2 right-2.5 hidden h-5 -translate-y-1/2 items-center rounded border px-1.5 font-mono text-[10px] opacity-100 transition-opacity duration-150 select-none group-focus-within:opacity-0 sm:flex">
              /
            </kbd>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger className={cn(buttonVariants({ size: "sm" }))}>
            <Plus className="size-4" aria-hidden="true" />
            New item
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {(
              Object.entries(TYPE_META) as [VaultItemType, (typeof TYPE_META)[VaultItemType]][]
            ).map(([type, { Icon, label }]) => (
              <DropdownMenuItem key={type} onClick={() => onCreate(type)}>
                <Icon className="size-3.5" aria-hidden="true" />
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Item count */}
      {!loading && filteredCount > 0 && (
        <p className="text-muted-foreground px-0.5 text-xs">
          {filteredCount === totalCount
            ? `${totalCount} ${totalCount === 1 ? "item" : "items"}`
            : `${filteredCount} of ${totalCount} items`}
        </p>
      )}
    </>
  );
}
