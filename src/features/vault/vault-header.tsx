"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import { LogOut, Moon, Search, Sun } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { KeyCryptLogo } from "@/components/shared/keycrypt-logo";
import { PadlockIcon } from "@/components/shared/design-icons";
import { clearVaultKey } from "@/lib/crypto";
import { clearOfflineVault } from "./offline-cache";
import { useVaultLock } from "@/providers/vault-lock-provider";
import { useCommandPalette } from "@/providers/command-palette-provider";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/vault", label: "Vault" },
  { href: "/vault/dashboard", label: "Dashboard" },
  { href: "/vault/settings", label: "Settings" },
  { href: "/vault/trash", label: "Trash" },
] as const;

interface VaultHeaderProps {
  initials: string;
  email: string;
}

function NavLinks({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Vault navigation" className={cn("flex items-stretch sm:gap-6", className)}>
      {NAV_LINKS.map(({ href, label }) => {
        const isActive = href === "/vault" ? pathname === "/vault" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "relative flex flex-1 items-center justify-center px-3 text-sm transition-colors sm:flex-none sm:px-0.5",
              // The design's 2px accent underline sits under the label, not at the header edge.
              "after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:transition-colors sm:after:inset-x-0.5 sm:after:top-[calc(50%+18px)] sm:after:bottom-auto",
              isActive
                ? "text-foreground after:bg-brand font-semibold"
                : "text-muted-foreground hover:text-foreground font-medium after:bg-transparent"
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function AccountMenu({ initials, email }: VaultHeaderProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [signingOut, setSigningOut] = useState(false);
  const isDark = resolvedTheme !== "light";

  async function handleSignOut() {
    setSigningOut(true);
    // Drop the in-memory vault key before the sign-out redirect.
    clearVaultKey();
    // …and the encrypted offline copy kept on this device.
    await clearOfflineVault();
    await signOut({ callbackUrl: "/auth/signin" });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="bg-brand-soft text-brand hover:ring-brand/40 flex size-[38px] shrink-0 items-center justify-center rounded-[10px] text-[13px] font-bold ring-1 ring-transparent transition-shadow outline-none focus-visible:ring-2"
        aria-label="Account menu"
        title={email}
      >
        {initials}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <div className="px-2 py-1.5">
          <p className="text-muted-foreground text-xs">Signed in as</p>
          <p className="truncate text-sm font-medium">{email}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setTheme(isDark ? "light" : "dark")}>
          {isDark ? (
            <Sun className="size-3.5" aria-hidden="true" />
          ) : (
            <Moon className="size-3.5" aria-hidden="true" />
          )}
          {isDark ? "Light theme" : "Dark theme"}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void handleSignOut()} disabled={signingOut}>
          <LogOut className="size-3.5" aria-hidden="true" />
          {signingOut ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function VaultHeader({ initials, email }: VaultHeaderProps) {
  const { lock } = useVaultLock();
  const { open: openPalette } = useCommandPalette();

  return (
    <header className="bg-card sticky top-0 z-40 border-b">
      <div className="mx-auto flex h-[68px] max-w-[1120px] items-stretch gap-4 px-4 sm:gap-7 sm:px-7">
        <div className="flex items-stretch gap-9">
          <KeyCryptLogo size="sm" className="self-center" />
          <NavLinks className="hidden sm:flex" />
        </div>

        <div className="ml-auto flex items-center gap-2.5">
          {/* Command palette trigger */}
          <button
            type="button"
            onClick={openPalette}
            className="bg-secondary text-faint hover:text-foreground hover:border-ring/40 flex h-[38px] items-center gap-2.5 rounded-[10px] border px-3 transition-colors"
          >
            <Search className="size-4" strokeWidth={1.6} aria-hidden="true" />
            <span className="sr-only text-[13px] sm:not-sr-only">Search</span>
            <kbd className="text-faint hidden rounded-[5px] border px-1.5 py-px font-sans text-[11px] sm:block">
              ⌘K
            </kbd>
          </button>
          <button
            type="button"
            onClick={lock}
            title="Lock vault"
            className="bg-secondary text-muted-foreground hover:text-foreground hover:border-ring/40 flex size-[38px] shrink-0 items-center justify-center rounded-[10px] border transition-colors"
          >
            <PadlockIcon className="size-[17px]" />
            <span className="sr-only">Lock vault</span>
          </button>
          <AccountMenu initials={initials} email={email} />
        </div>
      </div>

      {/* Phones: the tabs get their own row under the logo. */}
      <NavLinks className="h-11 border-t sm:hidden" />
    </header>
  );
}
