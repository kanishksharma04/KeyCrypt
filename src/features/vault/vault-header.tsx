"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Lock, LayoutDashboard, Search, Settings, Vault } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SignOutButton } from "@/components/shared/sign-out-button";
import { useVaultLock } from "@/providers/vault-lock-provider";
import { useCommandPalette } from "@/providers/command-palette-provider";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/vault", label: "Vault", Icon: Vault },
  { href: "/vault/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/vault/settings", label: "Settings", Icon: Settings },
] as const;

interface VaultHeaderProps {
  initials: string;
  email: string;
}

export function VaultHeader({ initials, email }: VaultHeaderProps) {
  const { lock } = useVaultLock();
  const { open: openPalette } = useCommandPalette();
  const pathname = usePathname();

  return (
    <header className="bg-background/95 supports-backdrop-filter:bg-background/60 sticky top-0 z-40 border-b backdrop-blur-md">
      <div className="container mx-auto flex h-12 max-w-4xl items-center gap-4 px-4">
        {/* Logo */}
        <Link
          href="/"
          className="text-foreground flex shrink-0 items-center gap-2 transition-opacity hover:opacity-80 focus-visible:rounded-md"
          aria-label="KeyCrypt home"
        >
          <Image
            src="/logos/wordmark-black.png"
            alt="KeyCrypt"
            width={437}
            height={158}
            className="h-7 w-auto dark:hidden"
            priority
          />
          <Image
            src="/logos/wordmark-white.png"
            alt="KeyCrypt"
            width={428}
            height={158}
            className="hidden h-7 w-auto dark:block"
            priority
          />
        </Link>

        {/* Nav links */}
        <nav aria-label="Vault navigation" className="flex flex-1 items-center gap-1">
          {NAV_LINKS.map(({ href, label, Icon }) => {
            const isActive = href === "/vault" ? pathname === "/vault" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-all duration-150",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                )}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon className="size-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          {/* Command palette trigger */}
          <button
            onClick={openPalette}
            className="text-muted-foreground hover:border-ring/40 hover:text-foreground flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors duration-150"
          >
            <Search className="size-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Search</span>
            <kbd className="bg-muted hidden items-center rounded border px-1 font-mono text-[10px] sm:flex">
              ⌘K
            </kbd>
          </button>
          {/* User avatar */}
          <div
            className="bg-primary/10 text-primary hover:ring-primary/30 flex size-6 cursor-default items-center justify-center rounded-full text-xs font-semibold ring-2 ring-transparent transition-all duration-150"
            title={email}
          >
            {initials}
          </div>
          {/* Lock */}
          <Button variant="ghost" size="icon-sm" onClick={lock} title="Lock vault">
            <Lock className="size-4" aria-hidden="true" />
            <span className="sr-only">Lock vault</span>
          </Button>
          {/* Sign out */}
          <SignOutButton display="icon" />
        </div>
      </div>
    </header>
  );
}
