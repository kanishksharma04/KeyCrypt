"use client";

import { useEffect, useRef } from "react";
import { ChevronDown, FolderCog, Search, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
  /** The folder filter, shown next to the search box. */
  folderControls?: React.ReactNode;
  /** Adds "Manage folders…" to the "New item" menu. */
  onManageFolders?: () => void;
}

/** Favourites filter, search, folder filter, item count and the "New item" menu. */
export function VaultToolbar({
  search,
  onSearchChange,
  favOnly,
  onFavOnlyChange,
  onCreate,
  loading,
  filteredCount,
  totalCount,
  folderControls,
  onManageFolders,
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

  const countLabel =
    !loading && filteredCount > 0
      ? filteredCount === totalCount
        ? `${totalCount} ${totalCount === 1 ? "item" : "items"}`
        : `${filteredCount} of ${totalCount} items`
      : null;

  return (
    <div className="flex flex-wrap items-center gap-3 md:flex-nowrap">
      {/* Favourites + search + folder filter */}
      <Button
        variant="outline"
        size="icon-lg"
        onClick={() => onFavOnlyChange(!favOnly)}
        title={favOnly ? "Show all items" : "Show favorites only"}
        aria-pressed={favOnly}
        className={cn(
          "bg-secondary dark:bg-secondary border-border text-brand size-[38px] shrink-0 rounded-[10px]",
          favOnly && "border-brand/50 bg-brand-soft dark:bg-brand-soft"
        )}
      >
        <Star
          className={cn("size-[17px]", favOnly && "fill-current")}
          strokeWidth={1.6}
          aria-hidden="true"
        />
        <span className="sr-only">Filter favorites</span>
      </Button>
      <div className="relative min-w-0 flex-1 basis-[calc(100%-3.25rem)] md:max-w-[33rem] md:basis-auto">
        <Search
          className="text-faint pointer-events-none absolute top-1/2 left-[13px] size-4 -translate-y-1/2"
          strokeWidth={1.6}
          aria-hidden="true"
        />
        <Input
          ref={searchRef}
          // Shown by the span below, so the keyboard hint can drop off on phones.
          placeholder=""
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="bg-card dark:bg-card border-border h-10 rounded-[10px] pr-9 pl-[38px] md:text-sm"
          aria-label="Search vault items"
        />
        {!search && (
          <span
            aria-hidden="true"
            className="text-faint pointer-events-none absolute inset-y-0 right-9 left-[38px] flex items-center truncate text-base md:text-sm"
          >
            Search your vault…
            <span className="ml-1 hidden md:inline">(press / to focus)</span>
          </span>
        )}
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2 rounded"
            aria-label="Clear search"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <div className="order-last min-w-0 flex-1 md:order-none md:w-44 md:flex-none">
        {folderControls}
      </div>

      {/* Count + New item */}
      <p className="text-faint order-last shrink-0 px-1 text-[13px] whitespace-nowrap tabular-nums md:order-none md:ml-auto">
        {countLabel}
      </p>
      <DropdownMenu>
        <DropdownMenuTrigger className="bg-brand text-brand-foreground hover:bg-brand/90 focus-visible:ring-ring/50 order-last inline-flex h-10 shrink-0 items-center gap-2 rounded-[10px] px-4 text-[13.5px] font-bold transition-colors outline-none focus-visible:ring-3 md:order-none">
          New item
          <ChevronDown className="size-[13px]" strokeWidth={2} aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          {(Object.entries(TYPE_META) as [VaultItemType, (typeof TYPE_META)[VaultItemType]][]).map(
            ([type, { Icon, label, iconColor }]) => (
              <DropdownMenuItem key={type} onClick={() => onCreate(type)}>
                <Icon className={cn("size-4", iconColor)} aria-hidden="true" />
                {label}
              </DropdownMenuItem>
            )
          )}
          {onManageFolders && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onManageFolders}>
                <FolderCog className="size-4" aria-hidden="true" />
                Manage folders…
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
