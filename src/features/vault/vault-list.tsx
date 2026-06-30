"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  Check,
  Code2,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  FileText,
  KeyRound,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Star,
  Trash2,
  Wifi,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { getVaultKey, decryptItem } from "@/lib/crypto";
import { deleteVaultItemAction, toggleFavoriteAction } from "@/server/vault-item-actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import type {
  DecryptedVaultItem,
  LoginSecret,
  SecureNoteSecret,
  ApiKeySecret,
  WifiPasswordSecret,
  VaultItemRow,
  VaultItemType,
} from "@/types/vault";
import { cn } from "@/lib/utils";

// ─── Relative time helper ─────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

// ─── Clipboard helper ─────────────────────────────────────────────────────────

async function copyToClipboard(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
    // Clear clipboard after 30 s to limit accidental exposure
    setTimeout(() => void navigator.clipboard.writeText(""), 30_000);
  } catch {
    toast.error("Failed to copy to clipboard");
  }
}

// ─── CopyButton ───────────────────────────────────────────────────────────────

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={async () => {
        await copyToClipboard(value, label);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      title={`Copy ${label}`}
    >
      {copied ? (
        <Check className="size-3.5 text-green-500" aria-hidden="true" />
      ) : (
        <Copy className="size-3.5" aria-hidden="true" />
      )}
    </Button>
  );
}

// ─── Type metadata ─────────────────────────────────────────────────────────────

const TYPE_META = {
  LOGIN: {
    Icon: KeyRound,
    label: "Login",
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
  },
  SECURE_NOTE: {
    Icon: FileText,
    label: "Secure Note",
    iconBg: "bg-green-500/10",
    iconColor: "text-green-500",
  },
  API_KEY: {
    Icon: Code2,
    label: "API Key",
    iconBg: "bg-purple-500/10",
    iconColor: "text-purple-500",
  },
  WIFI_PASSWORD: {
    Icon: Wifi,
    label: "WiFi Password",
    iconBg: "bg-orange-500/10",
    iconColor: "text-orange-500",
  },
} as const;

// ─── Decrypt helper ──────────────────────────────────────────────────────────

async function decryptVaultItem(key: CryptoKey, row: VaultItemRow): Promise<DecryptedVaultItem> {
  const raw = await decryptItem<unknown>(key, { ciphertext: row.ciphertext, iv: row.iv });
  const base = {
    id: row.id,
    name: row.name,
    favorite: row.favorite,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };

  switch (row.type) {
    case "LOGIN":
      return { ...base, type: "LOGIN" as const, secret: raw as LoginSecret };
    case "SECURE_NOTE":
      return { ...base, type: "SECURE_NOTE" as const, secret: raw as SecureNoteSecret };
    case "API_KEY":
      return { ...base, type: "API_KEY" as const, secret: raw as ApiKeySecret };
    case "WIFI_PASSWORD":
      return { ...base, type: "WIFI_PASSWORD" as const, secret: raw as WifiPasswordSecret };
  }
}

// ─── ViewItemDialog ───────────────────────────────────────────────────────────

function RevealField({ label, value }: { label: string; value: string }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</p>
      <div className="flex items-center gap-2">
        <p className="flex-1 font-mono text-sm break-all">
          {revealed ? value : "•".repeat(Math.min(value.length, 20))}
        </p>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setRevealed((r) => !r)}
          title={revealed ? "Hide" : "Reveal"}
        >
          {revealed ? (
            <EyeOff className="size-3.5" aria-hidden="true" />
          ) : (
            <Eye className="size-3.5" aria-hidden="true" />
          )}
        </Button>
        <CopyButton value={value} label={label} />
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</p>
      <div className="flex items-center gap-2">
        <p className={cn("flex-1 text-sm break-all", mono && "font-mono")}>{value || "—"}</p>
        {value && <CopyButton value={value} label={label} />}
      </div>
    </div>
  );
}

function ViewItemContent({ item }: { item: DecryptedVaultItem }) {
  const { Icon, iconBg, iconColor, label } = TYPE_META[item.type];

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-3">
          <div
            className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", iconBg)}
          >
            <Icon className={cn("size-4", iconColor)} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <DialogTitle className="truncate">{item.name}</DialogTitle>
            <p className="text-muted-foreground text-xs">{label}</p>
          </div>
        </div>
      </DialogHeader>

      <div className="divide-y">
        {item.type === "LOGIN" && (
          <>
            {item.secret.username && (
              <div className="py-3">
                <TextField label="Username" value={item.secret.username} />
              </div>
            )}
            <div className="py-3">
              <RevealField label="Password" value={item.secret.password} />
            </div>
            {item.secret.url && (
              <div className="py-3">
                <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                  Website
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <p className="flex-1 truncate text-sm">{item.secret.url}</p>
                  <a
                    href={item.secret.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
                    title="Open website"
                  >
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                  </a>
                </div>
              </div>
            )}
          </>
        )}

        {item.type === "SECURE_NOTE" && (
          <div className="py-3">
            <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
              Content
            </p>
            <div className="bg-muted relative rounded-lg p-3">
              <pre className="max-h-64 overflow-y-auto font-sans text-sm break-words whitespace-pre-wrap">
                {item.secret.content || "—"}
              </pre>
              {item.secret.content && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="absolute top-2 right-2"
                  onClick={() => void copyToClipboard(item.secret.content, "Note")}
                  title="Copy content"
                >
                  <Copy className="size-3.5" aria-hidden="true" />
                </Button>
              )}
            </div>
          </div>
        )}

        {item.type === "API_KEY" && (
          <>
            <div className="py-3">
              <RevealField label="API Key" value={item.secret.key} />
            </div>
            {item.secret.description && (
              <div className="py-3">
                <TextField label="Description" value={item.secret.description} />
              </div>
            )}
          </>
        )}

        {item.type === "WIFI_PASSWORD" && (
          <>
            {item.secret.ssid && (
              <div className="py-3">
                <TextField label="Network (SSID)" value={item.secret.ssid} />
              </div>
            )}
            <div className="py-3">
              <RevealField label="Password" value={item.secret.password} />
            </div>
            <div className="py-3">
              <TextField label="Security" value={item.secret.securityType} />
            </div>
          </>
        )}
      </div>
    </>
  );
}

function ViewItemDialog({
  item,
  onOpenChange,
}: {
  item: DecryptedVaultItem | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={!!item} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {item && <ViewItemContent item={item} />}
      </DialogContent>
    </Dialog>
  );
}

// ─── VaultItemCard ────────────────────────────────────────────────────────────

interface VaultItemCardProps {
  item: DecryptedVaultItem;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function VaultItemCard({ item, onView, onEdit, onDelete }: VaultItemCardProps) {
  const [pendingFav, startFavTransition] = useTransition();
  const { Icon, iconBg, iconColor } = TYPE_META[item.type];

  // Derived secondary display text (never secrets directly — shown as metadata)
  const secondaryText = (() => {
    if (item.type === "LOGIN") return item.secret.username;
    if (item.type === "SECURE_NOTE") {
      const t = item.secret.content.slice(0, 60);
      return item.secret.content.length > 60 ? `${t}…` : t;
    }
    if (item.type === "API_KEY") return item.secret.description;
    const { ssid, securityType } = item.secret;
    return ssid ? `${ssid} · ${securityType}` : securityType;
  })();

  // Primary copy action (the "sensitive" value for this item type)
  const primaryCopy = (() => {
    if (item.type === "LOGIN") return { text: item.secret.password, label: "Password" };
    if (item.type === "SECURE_NOTE") return { text: item.secret.content, label: "Note" };
    if (item.type === "API_KEY") return { text: item.secret.key, label: "API key" };
    return { text: item.secret.password, label: "Password" };
  })();

  // Secondary dropdown copy items specific to each type
  const dropdownCopyItems = (() => {
    if (item.type === "LOGIN" && item.secret.username) {
      return [{ label: "Copy username", text: item.secret.username }];
    }
    if (item.type === "WIFI_PASSWORD" && item.secret.ssid) {
      return [{ label: "Copy SSID", text: item.secret.ssid }];
    }
    if (item.type === "API_KEY" && item.secret.description) {
      return [{ label: "Copy description", text: item.secret.description }];
    }
    return [];
  })();

  const externalUrl = item.type === "LOGIN" ? item.secret.url : "";

  return (
    <div className="bg-card hover:bg-card/80 flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors">
      <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", iconBg)}>
        <Icon className={cn("size-4", iconColor)} aria-hidden="true" />
      </div>

      <button
        className="min-w-0 flex-1 cursor-pointer text-left"
        onClick={onView}
        title="View item"
      >
        <div className="flex items-baseline gap-2">
          <p className="truncate text-sm font-medium">{item.name}</p>
          <span className="text-muted-foreground shrink-0 text-xs">{timeAgo(item.updatedAt)}</span>
        </div>
        {secondaryText && <p className="text-muted-foreground truncate text-xs">{secondaryText}</p>}
      </button>

      <div className="flex shrink-0 items-center gap-1">
        {/* Primary copy */}
        {primaryCopy.text && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void copyToClipboard(primaryCopy.text, primaryCopy.label)}
            title={`Copy ${primaryCopy.label.toLowerCase()}`}
          >
            <Copy className="size-3.5" aria-hidden="true" />
            <span className="sr-only">Copy {primaryCopy.label}</span>
          </Button>
        )}

        {/* Open URL (Login only) */}
        {externalUrl && (
          <a
            href={externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
            title="Open website"
          >
            <ExternalLink className="size-3.5" aria-hidden="true" />
            <span className="sr-only">Open website</span>
          </a>
        )}

        {/* Favorite */}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() =>
            startFavTransition(async () => {
              const result = await toggleFavoriteAction(item.id, !item.favorite);
              if (result.error) toast.error(result.error);
            })
          }
          disabled={pendingFav}
          title={item.favorite ? "Remove from favorites" : "Add to favorites"}
        >
          <Star
            className={cn(
              "size-3.5",
              item.favorite ? "fill-amber-400 text-amber-400" : "text-muted-foreground"
            )}
            aria-hidden="true"
          />
          <span className="sr-only">
            {item.favorite ? "Remove from favorites" : "Add to favorites"}
          </span>
        </Button>

        {/* ⋮ More */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
          >
            <MoreHorizontal className="size-4" aria-hidden="true" />
            <span className="sr-only">More actions</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onView}>
              <Eye className="size-3.5" aria-hidden="true" />
              View
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="size-3.5" aria-hidden="true" />
              Edit
            </DropdownMenuItem>
            {dropdownCopyItems.map(({ label, text }) => (
              <DropdownMenuItem
                key={label}
                onClick={() => void copyToClipboard(text, label.replace("Copy ", ""))}
              >
                <Copy className="size-3.5" aria-hidden="true" />
                {label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 className="size-3.5" aria-hidden="true" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// ─── VaultList ────────────────────────────────────────────────────────────────

interface VaultListProps {
  items: VaultItemRow[];
}

type CreateType = VaultItemType | null;

export function VaultList({ items }: VaultListProps) {
  const [decrypted, setDecrypted] = useState<DecryptedVaultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [createType, setCreateType] = useState<CreateType>(null);
  const [favOnly, setFavOnly] = useState(false);
  const [viewItem, setViewItem] = useState<DecryptedVaultItem | null>(null);
  const [editItem, setEditItem] = useState<DecryptedVaultItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [isPendingDelete, startDeleteTransition] = useTransition();

  useEffect(() => {
    const key = getVaultKey();
    if (!key) return;

    void Promise.all(
      items.map(async (row) => {
        try {
          return await decryptVaultItem(key, row);
        } catch {
          // Decryption errors surface as empty secrets so one bad item
          // doesn't hide the rest of the vault.
          return {
            id: row.id,
            type: row.type,
            name: row.name,
            favorite: row.favorite,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            secret: {},
          } as DecryptedVaultItem;
        }
      })
    ).then((results) => {
      setDecrypted(results);
      setLoading(false);
    });
  }, [items]);

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
        setSearch("");
        searchRef.current?.blur();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const filtered = decrypted.filter((item) => {
    if (favOnly && !item.favorite) return false;
    const q = search.toLowerCase();
    if (!q) return true;
    if (item.name.toLowerCase().includes(q)) return true;
    if (item.type === "LOGIN")
      return (
        item.secret.username.toLowerCase().includes(q) || item.secret.url.toLowerCase().includes(q)
      );
    if (item.type === "WIFI_PASSWORD") return item.secret.ssid.toLowerCase().includes(q);
    return false;
  });

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
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <Button
          variant={favOnly ? "default" : "outline"}
          size="icon-sm"
          onClick={() => setFavOnly((f) => !f)}
          title={favOnly ? "Show all items" : "Show favorites only"}
        >
          <Star className={cn("size-3.5", favOnly && "fill-current")} aria-hidden="true" />
          <span className="sr-only">Filter favorites</span>
        </Button>
        <div className="relative max-w-xs flex-1">
          <Input
            ref={searchRef}
            placeholder="Search items… ( / )"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-8"
            aria-label="Search vault items"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
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
              <DropdownMenuItem key={type} onClick={() => setCreateType(type)}>
                <Icon className="size-3.5" aria-hidden="true" />
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Item count */}
      {!loading && filtered.length > 0 && (
        <p className="text-muted-foreground px-0.5 text-xs">
          {filtered.length === decrypted.length
            ? `${decrypted.length} ${decrypted.length === 1 ? "item" : "items"}`
            : `${filtered.length} of ${decrypted.length} items`}
        </p>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-2" aria-label="Loading vault items">
          {Array.from({ length: Math.min(Math.max(items.length, 1), 8) }, (_, i) => (
            <Skeleton key={i} className="h-15 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
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
              {search
                ? "No items match your search"
                : favOnly
                  ? "No favorites yet"
                  : "Your vault is empty"}
            </p>
            <p className="text-muted-foreground text-xs">
              {search
                ? "Try a different search term"
                : favOnly
                  ? "Star any item to pin it here"
                  : "Add your first item to get started"}
            </p>
          </div>
          {!search && !favOnly && (
            <Button size="sm" onClick={() => setCreateType("LOGIN")}>
              <Plus className="size-4" aria-hidden="true" />
              Add login
            </Button>
          )}
          {favOnly && !search && (
            <Button size="sm" variant="outline" onClick={() => setFavOnly(false)}>
              Show all items
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <VaultItemCard
              key={item.id}
              item={item}
              onView={() => setViewItem(item)}
              onEdit={() => setEditItem(item)}
              onDelete={() => setDeleteTarget({ id: item.id, name: item.name })}
            />
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
