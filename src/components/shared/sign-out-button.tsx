"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { Loader2, LogOut } from "lucide-react";
import type { VariantProps } from "class-variance-authority";
import { Button, type buttonVariants } from "@/components/ui/button";
import { clearVaultKey } from "@/lib/crypto";
import { clearOfflineVault } from "@/features/vault/offline-cache";

type ButtonStyle = VariantProps<typeof buttonVariants>;

interface SignOutButtonProps {
  /**
   * - "icon": icon only, with a screen-reader label (vault header)
   * - "label": text only (landing page, unlock screen)
   * - "icon-label": icon followed by text (settings page)
   */
  display?: "icon" | "label" | "icon-label";
  /** Visible text for the "label" and "icon-label" displays. */
  label?: string;
  variant?: ButtonStyle["variant"];
  size?: ButtonStyle["size"];
  callbackUrl?: string;
  className?: string;
}

export function SignOutButton({
  display = "label",
  label = "Sign out",
  variant = "ghost",
  size,
  callbackUrl = "/auth/signin",
  className,
}: SignOutButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    setLoading(true);
    // Drop the in-memory vault key immediately rather than waiting for the
    // page unload that follows the sign-out redirect.
    clearVaultKey();
    // …and the encrypted offline copy kept on this device.
    await clearOfflineVault();
    await signOut({ callbackUrl });
  }

  const icon = loading ? (
    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
  ) : (
    <LogOut className="size-4" aria-hidden="true" />
  );

  return (
    <Button
      type="button"
      variant={variant}
      size={size ?? (display === "icon" ? "icon-sm" : "default")}
      onClick={handleSignOut}
      disabled={loading}
      title={display === "icon" ? label : undefined}
      className={className}
    >
      {display === "icon" ? (
        <>
          {icon}
          <span className="sr-only">{label}</span>
        </>
      ) : (
        <>
          {display === "icon-label" && icon}
          {loading ? "Signing out…" : label}
        </>
      )}
    </Button>
  );
}
