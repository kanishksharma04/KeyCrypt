"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KeyCryptLogo } from "@/components/shared/keycrypt-logo";
import { relativeTime } from "@/lib/relative-time";
import type { DecryptedVaultItem } from "@/types/vault";
import { loadOfflineVault, type OfflineVaultSnapshot } from "./offline-cache";
import { decryptVaultItem } from "./use-decrypted-items";
import { unlockVault } from "./vault-crypto";
import { TYPE_META } from "./vault-item-types";
import { ViewItemDialog } from "./view-item-dialog";

// /offline: the read-only offline vault. Unlocks with the master password
// against the encrypted copy kept on this device (offline-cache.ts) and shows
// the items without editing. The vault key stays in this page's memory only.

type State =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "locked"; snapshot: OfflineVaultSnapshot }
  | { status: "unlocked"; snapshot: OfflineVaultSnapshot; items: DecryptedVaultItem[] };

function detail(item: DecryptedVaultItem): string {
  switch (item.type) {
    case "LOGIN":
      return item.secret.username;
    case "WIFI_PASSWORD":
      return item.secret.ssid;
    case "OTP_SECRET":
      return item.secret.issuer || item.secret.account;
    case "API_KEY":
      return item.secret.description;
    default:
      return "";
  }
}

export function OfflineVault() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [viewItem, setViewItem] = useState<DecryptedVaultItem | null>(null);

  useEffect(() => {
    void loadOfflineVault().then((snapshot) =>
      setState(snapshot ? { status: "locked", snapshot } : { status: "missing" })
    );
  }, []);

  async function unlock(snapshot: OfflineVaultSnapshot) {
    setError("");
    setBusy(true);
    try {
      const result = await unlockVault(password, {
        ...snapshot.meta,
        recoveryWrappedKey: null,
        recoveryIv: null,
        recoveryCreatedAt: null,
      });
      if (result.status === "wrong-password") {
        setError("Incorrect master password. Please try again.");
        return;
      }
      if (result.status === "needs-upgrade") {
        setError("Open KeyCrypt online once to finish upgrading your vault.");
        return;
      }
      const items = await Promise.all(
        snapshot.items.map((row) =>
          decryptVaultItem(result.vaultKey, row, snapshot.userId).catch(() => null)
        )
      );
      setPassword("");
      setState({
        status: "unlocked",
        snapshot,
        items: items
          .filter((i): i is DecryptedVaultItem => i !== null)
          .sort((a, b) => a.name.localeCompare(b.name)),
      });
    } catch {
      setError("Couldn't unlock the offline copy.");
    } finally {
      setBusy(false);
    }
  }

  const visible = useMemo(() => {
    if (state.status !== "unlocked") return [];
    const q = search.trim().toLowerCase();
    return q
      ? state.items.filter((i) => `${i.name} ${detail(i)}`.toLowerCase().includes(q))
      : state.items;
  }, [state, search]);

  const banner = (
    <div
      role="status"
      className="bg-secondary text-foreground flex items-center gap-2 rounded-[10px] border px-3.5 py-2.5 text-sm font-medium"
    >
      <WifiOff className="size-4 shrink-0" aria-hidden="true" />
      Offline, read-only
      {"snapshot" in state && (
        <span className="text-muted-foreground font-normal">
          · saved {relativeTime(state.snapshot.savedAt, { style: "long", longAgo: "ago" })}
        </span>
      )}
    </div>
  );

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[720px] flex-col gap-5 px-4 py-8">
      <div className="flex items-center justify-between">
        <KeyCryptLogo />
        <Link
          href="/vault"
          className="text-muted-foreground text-sm underline-offset-4 hover:underline"
        >
          Try online
        </Link>
      </div>
      {banner}

      {state.status === "loading" && (
        <p className="text-muted-foreground text-sm" role="status">
          Loading…
        </p>
      )}

      {state.status === "missing" && (
        <p className="text-muted-foreground text-sm">
          There&apos;s no offline copy of your vault on this device. Open KeyCrypt online and unlock
          your vault once; after that it can be read here without a connection.
        </p>
      )}

      {state.status === "locked" && (
        <form
          className="bg-card space-y-3 rounded-xl border p-5"
          onSubmit={(e) => {
            e.preventDefault();
            void unlock(state.snapshot);
          }}
        >
          <label htmlFor="masterPassword" className="text-sm font-medium">
            Master password
          </label>
          <Input
            id="masterPassword"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={busy || !password}>
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            Unlock offline copy
          </Button>
        </form>
      )}

      {state.status === "unlocked" && (
        <>
          <div className="flex gap-2">
            <Input
              aria-label="Search vault items"
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Button
              variant="outline"
              onClick={() => {
                setViewItem(null);
                setState({ status: "locked", snapshot: state.snapshot });
              }}
            >
              Lock
            </Button>
          </div>
          <p className="text-muted-foreground text-sm">
            {visible.length} of {state.items.length} items · editing needs a connection
          </p>
          <ul className="bg-card divide-y rounded-xl border" aria-label="Vault items (offline)">
            {visible.map((item) => {
              const meta = TYPE_META[item.type];
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className="hover:bg-row-hover flex w-full items-center gap-3 px-4 py-3 text-left"
                    onClick={() => setViewItem(item)}
                  >
                    <span
                      className={`${meta.iconBg} flex size-9 shrink-0 items-center justify-center rounded-[10px]`}
                    >
                      <meta.Icon className={`${meta.iconColor} size-[18px]`} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{item.name}</span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {detail(item) || meta.label}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {/* Read-only: no onEdit / onDelete, so the panel has no Edit or Move to Trash. */}
          <ViewItemDialog item={viewItem} onOpenChange={(open) => !open && setViewItem(null)} />
        </>
      )}
    </div>
  );
}
