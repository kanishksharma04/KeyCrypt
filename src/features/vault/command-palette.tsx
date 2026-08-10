"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Code2,
  FileText,
  KeyRound,
  LayoutDashboard,
  Lock,
  Moon,
  Settings as SettingsIcon,
  Sun,
  Vault,
  Wifi,
} from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useCommandPalette } from "@/providers/command-palette-provider";
import { useVaultLock } from "@/providers/vault-lock-provider";
import { getVaultItemSummariesAction } from "@/server/vault-item-actions";
import type { VaultItemType } from "@/types/vault";

const TYPE_META = {
  LOGIN: { Icon: KeyRound, label: "Login" },
  SECURE_NOTE: { Icon: FileText, label: "Secure Note" },
  API_KEY: { Icon: Code2, label: "API Key" },
  WIFI_PASSWORD: { Icon: Wifi, label: "WiFi Password" },
} as const;

interface ItemSummary {
  id: string;
  type: VaultItemType;
  name: string;
}

export function CommandPalette() {
  const { isOpen, close } = useCommandPalette();
  const { lock } = useVaultLock();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [items, setItems] = useState<ItemSummary[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Load the item list lazily on first open rather than on every keystroke —
  // cmdk does the fuzzy filtering locally once the list is in memory.
  useEffect(() => {
    if (!isOpen || loaded) return;
    void getVaultItemSummariesAction().then((res) => {
      if (!("error" in res)) setItems(res);
      setLoaded(true);
    });
  }, [isOpen, loaded]);

  function run(action: () => void) {
    close();
    action();
  }

  return (
    <CommandDialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <Command>
        <CommandInput placeholder="Search items or run a command…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          <CommandGroup heading="Quick actions">
            {(
              Object.entries(TYPE_META) as [VaultItemType, (typeof TYPE_META)[VaultItemType]][]
            ).map(([type, { Icon, label }]) => (
              <CommandItem key={type} onSelect={() => run(() => router.push(`/vault?new=${type}`))}>
                <Icon aria-hidden="true" />
                New {label.toLowerCase()}
              </CommandItem>
            ))}
            <CommandItem onSelect={() => run(() => router.push("/vault"))}>
              <Vault aria-hidden="true" />
              Go to vault
            </CommandItem>
            <CommandItem onSelect={() => run(() => router.push("/vault/dashboard"))}>
              <LayoutDashboard aria-hidden="true" />
              Go to dashboard
            </CommandItem>
            <CommandItem onSelect={() => run(() => router.push("/vault/settings"))}>
              <SettingsIcon aria-hidden="true" />
              Go to settings
            </CommandItem>
            <CommandItem onSelect={() => run(() => setTheme(theme === "dark" ? "light" : "dark"))}>
              {theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
              Toggle theme
            </CommandItem>
            <CommandItem onSelect={() => run(lock)}>
              <Lock aria-hidden="true" />
              Lock vault
            </CommandItem>
          </CommandGroup>

          {items.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Vault items">
                {items.map((item) => {
                  const { Icon } = TYPE_META[item.type];
                  return (
                    <CommandItem
                      key={item.id}
                      value={item.name}
                      onSelect={() => run(() => router.push(`/vault?open=${item.id}`))}
                    >
                      <Icon aria-hidden="true" />
                      {item.name}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
