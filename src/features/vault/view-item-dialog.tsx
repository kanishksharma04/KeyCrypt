"use client";

import { useState } from "react";
import { Copy, Eye, EyeOff, ExternalLink } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CopyButton } from "@/components/shared/copy-button";
import type { DecryptedVaultItem } from "@/types/vault";
import { TYPE_META, copyToClipboard } from "./vault-item-meta";
import { cn } from "@/lib/utils";

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
        <CopyButton
          value={value}
          label={label}
          size="icon-sm"
          resetMs={1500}
          className="[&_svg]:size-3.5"
        />
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
        {value && (
          <CopyButton
            value={value}
            label={label}
            size="icon-sm"
            resetMs={1500}
            className="[&_svg]:size-3.5"
          />
        )}
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
                  onClick={() => void copyToClipboard(item.secret.content)}
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

export function ViewItemDialog({
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
