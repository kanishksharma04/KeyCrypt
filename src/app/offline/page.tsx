import type { Metadata } from "next";
import { OfflineVault } from "@/features/vault/offline-vault";

// The read-only offline vault. Public (no session needed): it shows nothing
// until the master password unlocks the encrypted copy kept on this device.
// The service worker (public/sw.js) caches this page for offline use.

export const metadata: Metadata = { title: "Offline vault" };

export default function OfflinePage() {
  return <OfflineVault />;
}
