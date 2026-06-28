"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { clearVaultKey, isVaultUnlocked } from "@/lib/crypto";

// 15 minutes of inactivity → lock the vault
const INACTIVITY_MS = 15 * 60 * 1000;

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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lock = useCallback(() => {
    clearVaultKey();
    setIsLocked(true);
    router.replace("/vault/unlock");
  }, [router]);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(lock, INACTIVITY_MS);
  }, [lock]);

  useEffect(() => {
    if (!isVaultUnlocked()) {
      router.replace("/vault/unlock");
      return;
    }

    resetTimer();

    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));

    // Belt-and-suspenders: clear the in-memory key on tab close.
    // The key is lost when the JS context is destroyed anyway, but clearing
    // it explicitly ensures no lingering reference.
    const handleUnload = () => clearVaultKey();
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, resetTimer));
      window.removeEventListener("beforeunload", handleUnload);
    };
  }, [lock, resetTimer, router]);

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
