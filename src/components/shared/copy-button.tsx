"use client";

import { useState, useCallback } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CopyButtonProps {
  value: string;
  /** Milliseconds before the button resets (default: 2000). */
  resetMs?: number;
  className?: string;
  size?: "default" | "sm" | "lg" | "icon";
}

export function CopyButton({ value, resetMs = 2000, className, size = "icon" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), resetMs);
  }, [value, resetMs]);

  return (
    <Button
      variant="ghost"
      size={size}
      onClick={handleCopy}
      aria-label={copied ? "Copied" : "Copy to clipboard"}
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
