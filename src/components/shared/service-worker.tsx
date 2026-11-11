"use client";

import { useEffect } from "react";

/**
 * Registers public/sw.js (production only): caches the app shell and the
 * /offline page so an installed app can open the read-only offline vault.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Not fatal: the app works online without it.
    });
  }, []);
  return null;
}
