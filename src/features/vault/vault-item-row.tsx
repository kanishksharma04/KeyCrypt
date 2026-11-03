"use client";

import { useTransition } from "react";
import { Copy, Eye, ExternalLink, MoreHorizontal, Pencil, Star, Trash2 } from "lucide-react";
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
import { TYPE_META, copyToClipboard, timeAgo } from "./vault-item-meta";
import { cn } from "@/lib/utils";
import { currentTotpCode } from "@/lib/crypto";

// ─── VaultItemRow ─────────────────────────────────────────────────────────────

interface VaultItemRowProps {
  item: DecryptedVaultItem;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function VaultItemRow({ item, onView, onEdit, onDelete }: VaultItemRowProps) {
  const [pendingFav, startFavTransition] = useTransition();
  const { Icon, iconBg, iconColor } = TYPE_META[item.type];

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

  const externalUrl = item.type === "LOGIN" ? item.secret.url : "";

  return (
    <div className="bg-card hover:bg-card/80 group flex items-center gap-3 rounded-xl border px-4 py-2.5 transition-all duration-150 hover:-translate-y-px hover:shadow-sm">
      <div
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg transition-transform duration-150 group-hover:scale-105",
          iconBg
        )}
      >
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
              <DropdownMenuItem key={label} onClick={() => void copyToClipboard(text)}>
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
