"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { clearVaultKey, isVaultUnlocked } from "@/lib/crypto";
import { ACTIVITY_THROTTLE_MS, LOCK_CHECK_INTERVAL_MS, shouldLock } from "@/lib/vault-lock";

const ACTIVITY_EVENTS = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;

interface VaultLockCtxValue {
  isLocked: boolean;
  lock: () => void;
}

const VaultLockCtx = createContext<VaultLockCtxValue | null>(null);

export function VaultLockProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  // Derive initial state synchronously so locked content is never flashed to the user.
  const [isLocked, setIsLocked] = useState(() => !isVaultUnlocked());

  // Timestamps, not timers: see src/lib/vault-lock.ts for why.
  // Set on mount (render must stay pure, so no Date.now() here).
  const lastActivityAt = useRef(0);
  const hiddenAt = useRef<number | null>(null);

  const lock = useCallback(() => {
    clearVaultKey();
    setIsLocked(true);
    router.replace("/vault/unlock");
  }, [router]);

  useEffect(() => {
    if (!isVaultUnlocked()) {
      router.replace("/vault/unlock");
      return;
    }

    lastActivityAt.current = Date.now();
    hiddenAt.current = document.hidden ? Date.now() : null;

    const check = () => {
      if (!isVaultUnlocked()) return; // already locked
      if (shouldLock(Date.now(), lastActivityAt.current, hiddenAt.current)) lock();
    };

    // Throttled: mousemove fires constantly; one timestamp per second is plenty.
    const onActivity = () => {
      const now = Date.now();
      if (now - lastActivityAt.current >= ACTIVITY_THROTTLE_MS) lastActivityAt.current = now;
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        hiddenAt.current = Date.now();
      } else {
        // Decide on the hidden period (and any sleep) before forgetting it.
        check();
        hiddenAt.current = null;
      }
    };

    // Belt-and-suspenders: clear the in-memory key when the page unloads.
    // Not reliable on its own (mobile browsers often skip it); the key is gone
    // with the page's memory anyway.
    const onUnload = () => clearVaultKey();

    const interval = setInterval(check, LOCK_CHECK_INTERVAL_MS);
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("beforeunload", onUnload);

    return () => {
      clearInterval(interval);
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [lock, router]);

  if (isLocked) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2
          className="text-muted-foreground size-8 animate-spin"
          aria-label="Redirecting to unlock screen…"
        />
      </div>
    );
  }

  return <VaultLockCtx.Provider value={{ isLocked, lock }}>{children}</VaultLockCtx.Provider>;
}

export function useVaultLock(): VaultLockCtxValue {
  const ctx = useContext(VaultLockCtx);
  if (!ctx) throw new Error("useVaultLock must be used within VaultLockProvider");
  return ctx;
}
