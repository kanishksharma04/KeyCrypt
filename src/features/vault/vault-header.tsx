"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Lock, LayoutDashboard, LogOut, Settings, Vault } from "lucide-react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { useVaultLock } from "@/providers/vault-lock-provider";
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
  const pathname = usePathname();

  return (
    <header className="bg-background/95 supports-backdrop-filter:bg-background/60 sticky top-0 z-40 border-b backdrop-blur">
      <div className="container mx-auto flex h-12 max-w-4xl items-center gap-4 px-4">
        {/* Logo */}
        <Link
          href="/vault"
          className="text-foreground flex shrink-0 items-center gap-2 transition-opacity hover:opacity-80 focus-visible:rounded-md"
          aria-label="KeyCrypt vault"
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
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
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
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void signOut({ callbackUrl: "/auth/signin" })}
            title="Sign out"
          >
            <LogOut className="size-4" aria-hidden="true" />
            <span className="sr-only">Sign out</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
