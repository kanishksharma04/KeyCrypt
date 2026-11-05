"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import { Lock, LogOut, Moon, Search, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { KeyCryptLogo } from "@/components/shared/keycrypt-logo";
import { clearVaultKey } from "@/lib/crypto";
import { useVaultLock } from "@/providers/vault-lock-provider";
import { useCommandPalette } from "@/providers/command-palette-provider";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/vault", label: "Vault" },
  { href: "/vault/dashboard", label: "Dashboard" },
  { href: "/vault/settings", label: "Settings" },
] as const;

interface VaultHeaderProps {
  initials: string;
  email: string;
}

function NavLinks({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Vault navigation" className={cn("flex items-stretch", className)}>
      {NAV_LINKS.map(({ href, label }) => {
        const isActive = href === "/vault" ? pathname === "/vault" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "relative flex flex-1 items-center justify-center px-3 text-[15px] font-medium transition-colors sm:flex-none",
              "after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:transition-colors",
              isActive
                ? "text-foreground after:bg-brand"
                : "text-muted-foreground hover:text-foreground after:bg-transparent"
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
    await signOut({ callbackUrl: "/auth/signin" });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="bg-brand-soft text-brand hover:ring-brand/40 flex size-9 items-center justify-center rounded-lg text-sm font-semibold ring-1 ring-transparent transition-shadow outline-none focus-visible:ring-2"
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
    <header className="bg-background/85 supports-backdrop-filter:bg-background/70 sticky top-0 z-40 border-b backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-stretch gap-6 px-4 sm:px-6">
        <KeyCryptLogo className="self-center" />

        <NavLinks className="hidden sm:flex" />

        <div className="ml-auto flex items-center gap-2">
          {/* Command palette trigger */}
          <button
            type="button"
            onClick={openPalette}
            className="text-muted-foreground hover:text-foreground hover:border-ring/40 bg-card/60 flex h-9 items-center gap-2 rounded-lg border px-2.5 text-sm transition-colors sm:min-w-36 sm:px-3"
          >
            <Search className="size-4" aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Search</span>
            <kbd className="bg-muted text-muted-foreground ml-auto hidden h-5 items-center rounded border px-1.5 font-mono text-[10px] sm:flex">
              ⌘K
            </kbd>
          </button>
          <Button
            variant="outline"
            size="icon-lg"
            className="rounded-lg"
            onClick={lock}
            title="Lock vault"
          >
            <Lock className="size-4" aria-hidden="true" />
            <span className="sr-only">Lock vault</span>
          </Button>
          <AccountMenu initials={initials} email={email} />
        </div>
      </div>

      {/* Phones: the tabs get their own row under the logo. */}
      <NavLinks className="h-11 border-t sm:hidden" />
    </header>
  );
}
