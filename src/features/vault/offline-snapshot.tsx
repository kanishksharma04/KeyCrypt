"use client";

import { useEffect } from "react";
import { getVaultMetaAction } from "@/server/vault-actions";
import { useVaultUserId } from "@/providers/vault-user-provider";
import type { VaultItemRow } from "@/types/vault";
import { saveOfflineVault } from "./offline-cache";

/**
 * After each online load of the vault, keep the latest encrypted vault for
 * /offline (src/features/vault/offline-cache.ts) and ask the service worker to
 * refresh its cached offline page. Ciphertext and unlock material only.
 */
export function OfflineSnapshot({ items }: { items: VaultItemRow[] }) {
  const userId = useVaultUserId();

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.onLine) return;
    let cancelled = false;
    void (async () => {
      try {
        const meta = await getVaultMetaAction();
        if (!meta || cancelled) return;
        await saveOfflineVault({ userId, meta, items });
        navigator.serviceWorker?.controller?.postMessage({ type: "cache-offline-shell" });
      } catch {
        // Offline copies are best effort; the vault works without them.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [items, userId]);

  return null;
}
