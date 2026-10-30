"use client";

import { useState, useCallback } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import type { VariantProps } from "class-variance-authority";
import { Button, type buttonVariants } from "@/components/ui/button";
import { copySecret, COPIED_TOAST } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

interface CopyButtonProps {
  value: string;
  /** What is being copied, for screen readers (e.g. "Password"). */
  label?: string;
  /** Milliseconds before the icon resets (default: 2000). */
  resetMs?: number;
  className?: string;
  size?: VariantProps<typeof buttonVariants>["size"];
}

/** Copies a secret and clears the clipboard 30 seconds later (src/lib/clipboard.ts). */
export function CopyButton({
  value,
  label,
  resetMs = 2000,
  className,
  size = "icon",
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await copySecret(value);
    } catch {
      toast.error("Failed to copy to clipboard");
      return;
    }
    toast.success(COPIED_TOAST);
    setCopied(true);
    setTimeout(() => setCopied(false), resetMs);
  }, [value, resetMs]);

  const what = label ? label.toLowerCase() : "to clipboard";

  return (
    <Button
      variant="ghost"
      size={size}
      onClick={handleCopy}
      aria-label={copied ? "Copied" : `Copy ${what}`}
      title={label ? `Copy ${what}` : undefined}
      className={cn("transition-colors", className)}
    >
      {copied ? (
        <Check className="text-success size-4" aria-hidden="true" />
      ) : (
        <Copy className="size-4" aria-hidden="true" />
      )}
    </Button>
  );
}
