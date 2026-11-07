"use client";

import { useState } from "react";
import { ArrowUpRight, Copy, Eye, EyeOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { CopyButton } from "@/components/shared/copy-button";
import type { DecryptedVaultItem } from "@/types/vault";
import { TYPE_META, copyToClipboard } from "./vault-item-meta";
import { cn } from "@/lib/utils";
import { loginTotpParams, TotpCode } from "./totp-code";

// ─── ViewItemDialog ───────────────────────────────────────────────────────────
// The design's detail panel: a 420px sheet sliding in from the right, with each
// field in its own box.

const FIELD_BOX =
  "bg-secondary flex min-h-[44px] items-center gap-2 rounded-[10px] border py-1.5 pr-2 pl-3.5";
const FIELD_ICON_BUTTON = "text-faint hover:text-foreground [&_svg]:size-[15px]";

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-faint mb-1.5 text-xs font-semibold">{children}</p>;
}

function RevealField({ label, value }: { label: string; value: string }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className={FIELD_BOX}>
        <p className="flex-1 font-mono text-sm tracking-[0.02em] break-all">
          {value ? (revealed ? value : "•".repeat(12)) : "—"}
        </p>
        {value && (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              className={FIELD_ICON_BUTTON}
              onClick={() => setRevealed((r) => !r)}
              title={revealed ? "Hide" : "Reveal"}
            >
              {revealed ? (
                <EyeOff strokeWidth={1.6} aria-hidden="true" />
              ) : (
                <Eye strokeWidth={1.6} aria-hidden="true" />
              )}
            </Button>
            <CopyButton
              value={value}
              label={label}
              size="icon-sm"
              resetMs={1500}
              className={FIELD_ICON_BUTTON}
            />
          </>
        )}
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
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className={FIELD_BOX}>
        <p className={cn("flex-1 text-sm break-all", mono && "font-mono")}>{value || "—"}</p>
        {value && (
          <CopyButton
            value={value}
            label={label}
            size="icon-sm"
            resetMs={1500}
            className={FIELD_ICON_BUTTON}
          />
        )}
      </div>
    </div>
  );
}

/** Multi-line text (a secure note's content, or any item's notes) with a copy button. */
function LongTextField({
  label,
  value,
  tall = false,
}: {
  label: string;
  value: string;
  tall?: boolean;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="bg-secondary relative rounded-[10px] border px-3.5 py-3">
        <pre
          className={cn(
            "text-muted-foreground overflow-y-auto pr-8 font-sans text-[13.5px] leading-[1.6] wrap-break-word whitespace-pre-wrap",
            tall ? "max-h-80" : "max-h-[140px]"
          )}
        >
          {value || "—"}
        </pre>
        {value && (
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn("absolute top-2 right-2", FIELD_ICON_BUTTON)}
            onClick={() => void copyToClipboard(value)}
            title={`Copy ${label.toLowerCase()}`}
          >
            <Copy strokeWidth={1.6} aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  );
}

/** The item's notes, if it has any (secure notes show theirs as content instead). */
function notesOf(item: DecryptedVaultItem): string {
  return item.type === "SECURE_NOTE" ? "" : item.secret.notes;
}

function ItemFields({ item }: { item: DecryptedVaultItem }) {
  if (item.type === "LOGIN") {
    const totp = loginTotpParams(item.secret.totp);
    // Only web links are opened (imported items can hold any string here).
    const webUrl = /^https?:\/\//i.test(item.secret.url) ? item.secret.url : "";
    return (
      <>
        <TextField label="Username" value={item.secret.username} />
        <RevealField label="Password" value={item.secret.password} />
        {totp && <TotpCode params={totp} label="Authenticator code" />}
        {webUrl ? (
          <a
            href={webUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand flex w-fit max-w-full items-center gap-2 rounded text-[13.5px] font-medium underline-offset-4 hover:underline"
            title={webUrl}
          >
            Open website
            <ArrowUpRight className="size-[13px] shrink-0" strokeWidth={1.6} aria-hidden="true" />
          </a>
        ) : (
          item.secret.url && <TextField label="Website" value={item.secret.url} />
        )}
      </>
    );
  }

  if (item.type === "SECURE_NOTE") {
    return <LongTextField label="Content" value={item.secret.content} tall />;
  }

  if (item.type === "API_KEY") {
    return (
      <>
        <RevealField label="API Key" value={item.secret.key} />
        {item.secret.description && (
          <TextField label="Description" value={item.secret.description} />
        )}
      </>
    );
  }

  if (item.type === "WIFI_PASSWORD") {
    return (
      <>
        {item.secret.ssid && <TextField label="Network (SSID)" value={item.secret.ssid} />}
        <RevealField label="Password" value={item.secret.password} />
        <TextField label="Security" value={item.secret.securityType} />
      </>
    );
  }

  return (
    <>
      <TotpCode params={item.secret} label="Authenticator code" />
      {item.secret.issuer && <TextField label="Issuer" value={item.secret.issuer} />}
      {item.secret.account && <TextField label="Account" value={item.secret.account} />}
      <RevealField label="Secret key" value={item.secret.secret} />
    </>
  );
}

function ViewItemContent({
  item,
  onEdit,
  onDelete,
}: {
  item: DecryptedVaultItem;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const notes = notesOf(item);
  const { Icon, iconBg, iconColor, label } = TYPE_META[item.type];

  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b px-5 py-5 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <div
            className={cn(
              "flex size-[34px] shrink-0 items-center justify-center rounded-[9px]",
              iconBg
            )}
          >
            <Icon className={cn("size-4", iconColor)} strokeWidth={1.6} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <DialogTitle className="truncate text-[15.5px] leading-snug font-semibold">
              {item.name}
            </DialogTitle>
            <DialogDescription className="text-faint text-xs">{label}</DialogDescription>
          </div>
        </div>
        <DialogClose
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-faint hover:text-foreground size-8 shrink-0 rounded-lg"
            />
          }
        >
          <X className="size-[18px]" strokeWidth={1.8} aria-hidden="true" />
          <span className="sr-only">Close</span>
        </DialogClose>
      </div>

      <div className="flex flex-col gap-5 p-5 sm:p-6">
        <ItemFields item={item} />
        {notes && <LongTextField label="Notes" value={notes} />}

        {(onEdit || onDelete) && (
          <div className="flex gap-2.5 border-t pt-4">
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="bg-secondary hover:border-ring/40 flex-1 rounded-[10px] border p-[11px] text-[13.5px] font-semibold transition-colors"
              >
                Edit
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="text-destructive hover:bg-destructive/10 flex-1 rounded-[10px] border p-[11px] text-[13.5px] font-semibold transition-colors"
              >
                Delete
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

export function ViewItemDialog({
  item,
  onOpenChange,
  onEdit,
  onDelete,
}: {
  item: DecryptedVaultItem | null;
  onOpenChange: (open: boolean) => void;
  /** Shows an "Edit" button at the bottom of the panel. */
  onEdit?: (item: DecryptedVaultItem) => void;
  /** Shows a "Delete" button at the bottom of the panel. */
  onDelete?: (item: DecryptedVaultItem) => void;
}) {
  return (
    <Dialog open={!!item} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "bg-card top-0 right-0 left-auto block h-dvh w-full max-w-[min(420px,100%)] translate-x-0 translate-y-0 gap-0 overflow-y-auto rounded-none border-l p-0 ring-0 sm:max-w-[420px]",
          "shadow-[-30px_0_60px_-30px_rgb(0_0_0/0.5)] duration-300",
          "data-open:slide-in-from-right data-closed:slide-out-to-right data-closed:zoom-out-100 data-open:zoom-in-100"
        )}
      >
        {item && (
          <ViewItemContent
            item={item}
            onEdit={onEdit && (() => onEdit(item))}
            onDelete={onDelete && (() => onDelete(item))}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
