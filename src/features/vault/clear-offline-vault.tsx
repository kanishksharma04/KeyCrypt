"use client";

import { useEffect } from "react";
import { clearOfflineVault } from "./offline-cache";

/**
 * Rendered on the sign-in page: a device only lands there online and without a
 * valid session (signed out, session expired, or revoked by "Sign out of all
 * devices" elsewhere), so its offline copy of the vault is removed.
 */
export function ClearOfflineVault() {
  useEffect(() => {
    void clearOfflineVault();
  }, []);
  return null;
}
