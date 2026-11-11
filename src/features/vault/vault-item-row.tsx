"use client";

import { useTransition } from "react";
import {
  Copy,
  Eye,
  ExternalLink,
  FolderInput,
  MoreHorizontal,
  Pencil,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { toggleFavoriteAction } from "@/server/vault-item-actions";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DecryptedVaultItem } from "@/types/vault";
import { TYPE_META, copyToClipboard } from "./vault-item-meta";
import { relativeTime } from "@/lib/relative-time";
import { cn } from "@/lib/utils";
import { currentTotpCode } from "@/lib/crypto";

// ─── VaultItemRow ─────────────────────────────────────────────────────────────

interface VaultItemRowProps {
  item: DecryptedVaultItem;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMove?: () => void;
  /** Decrypted name of the item's folder, if it has one. */
  folderName?: string;
}

export function VaultItemRow({
  item,
  onView,
  onEdit,
  onDelete,
  onMove,
  folderName,
}: VaultItemRowProps) {
  const [pendingFav, startFavTransition] = useTransition();
  const { Icon, iconBg, iconColor, label: typeLabel } = TYPE_META[item.type];

  // Derived secondary display text (never secrets directly — shown as metadata)
  const secondaryText = (() => {
    if (item.type === "LOGIN") return item.secret.username;
    if (item.type === "SECURE_NOTE") return null;
    if (item.type === "API_KEY") return item.secret.description;
    if (item.type === "OTP_SECRET") {
      return [item.secret.issuer, item.secret.account].filter(Boolean).join(" · ") || null;
    }
    const { ssid, securityType } = item.secret;
    return ssid ? `${ssid} · ${securityType}` : securityType;
  })();

  // Primary copy action (the "sensitive" value for this item type)
  // `text` is read at click time: an authenticator code changes every period.
  const primaryCopy = ((): { text: () => string; label: string } => {
    if (item.type === "LOGIN") return { text: () => item.secret.password, label: "Password" };
    if (item.type === "SECURE_NOTE") return { text: () => item.secret.content, label: "Note" };
    if (item.type === "API_KEY") return { text: () => item.secret.key, label: "API key" };
    if (item.type === "OTP_SECRET") {
      const secret = item.secret;
      const code = () => {
        try {
          return currentTotpCode(secret).code;
        } catch {
          return ""; // damaged secret: nothing to copy
        }
      };
      return { text: code, label: "Code" };
    }
    return { text: () => item.secret.password, label: "Password" };
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

  // Only web links are opened (imported items can hold any string here).
  const externalUrl =
    item.type === "LOGIN" && /^https?:\/\//i.test(item.secret.url) ? item.secret.url : "";

  function toggleFavorite() {
    startFavTransition(async () => {
      const result = await toggleFavoriteAction(item.id, !item.favorite);
      if (result.error) toast.error(result.error);
    });
  }

  return (
    <div className="group hover:bg-row-hover focus-within:bg-row-hover relative flex items-center gap-3 px-3 py-3.5 transition-colors sm:gap-3.5 sm:px-5 sm:py-4">
      <div
        className={cn(
          "flex size-[38px] shrink-0 items-center justify-center rounded-[10px]",
          iconBg
        )}
      >
        <Icon className={cn("size-[18px]", iconColor)} strokeWidth={1.6} aria-hidden="true" />
      </div>

      <button
        type="button"
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-md text-left sm:gap-3.5"
        onClick={onView}
        title="View item"
      >
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[14.5px] font-semibold">{item.name}</span>
            {item.favorite && (
              <Star className="fill-brand text-brand size-3 shrink-0" aria-label="Favorite" />
            )}
          </span>
          <span className="text-faint mt-0.5 block truncate text-[13px]">
            {secondaryText || typeLabel}
          </span>
        </span>
        {folderName && (
          <span className="bg-muted text-muted-foreground inline-flex max-w-24 shrink-0 rounded-full px-2.5 py-1 text-[11.5px] leading-none font-semibold sm:max-w-40">
            <span className="truncate">{folderName}</span>
          </span>
        )}
        <span className="text-faint hidden w-28 shrink-0 text-right text-[12.5px] whitespace-nowrap md:block">
          {relativeTime(item.updatedAt, { style: "long", longAgo: "ago" })}
        </span>
      </button>

      {/* Touch screens: always shown. With a mouse: fades in over the time on hover/focus. */}
      <div className="can-hover:bg-row-hover can-hover:absolute can-hover:top-1/2 can-hover:right-3 can-hover:-translate-y-1/2 can-hover:pl-2 can-hover:opacity-0 can-hover:sm:right-5 flex shrink-0 items-center justify-end gap-0.5 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        {/* Primary copy */}
        {primaryCopy.text() && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void copyToClipboard(primaryCopy.text())}
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
            className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "hidden sm:flex")}
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
          className="hidden sm:inline-flex"
          onClick={toggleFavorite}
          disabled={pendingFav}
          title={item.favorite ? "Remove from favorites" : "Add to favorites"}
        >
          <Star
            className={cn(
              "size-3.5",
              item.favorite ? "fill-brand text-brand" : "text-muted-foreground"
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
            <DropdownMenuItem className="sm:hidden" onClick={toggleFavorite} disabled={pendingFav}>
              <Star className="size-3.5" aria-hidden="true" />
              {item.favorite ? "Remove from favorites" : "Add to favorites"}
            </DropdownMenuItem>
            {externalUrl && (
              <DropdownMenuItem
                className="sm:hidden"
                onClick={() => window.open(externalUrl, "_blank", "noopener,noreferrer")}
              >
                <ExternalLink className="size-3.5" aria-hidden="true" />
                Open website
              </DropdownMenuItem>
            )}
            {onMove && (
              <DropdownMenuItem onClick={onMove}>
                <FolderInput className="size-3.5" aria-hidden="true" />
                Move to folder…
              </DropdownMenuItem>
            )}
            {dropdownCopyItems.map(({ label, text }) => (
              <DropdownMenuItem key={label} onClick={() => void copyToClipboard(text)}>
                <Copy className="size-3.5" aria-hidden="true" />
                {label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 className="size-3.5" aria-hidden="true" />
              Move to Trash
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
