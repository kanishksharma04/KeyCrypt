import { ext } from "./browser";
import type { DecryptedVault } from "./vault";

// Messages between the popup / content script and the background service
// worker (ext.runtime messaging, inside the extension only).

export type Request =
  | { type: "status"; tabId?: number }
  | { type: "unlock"; password: string; minutes: number; tabId?: number }
  | { type: "lock" }
  | { type: "save-login"; tabId: number }
  | { type: "dismiss-save"; tabId: number }
  | { type: "sync-save-script" }
  /** From the content script (src/save.ts) after a login form is submitted. */
  | { type: "login-submitted"; url: string; username: string; password: string };

/** A submitted login the popup can offer to save (never includes the password). */
export interface SaveOffer {
  host: string;
  username: string;
  /** The vault already has a login for this site with this username and password. */
  duplicate: boolean;
}

export type Status =
  | { state: "signed-out" }
  | { state: "unreachable" }
  | { state: "no-vault" }
  | { state: "locked"; offer: SaveOffer | null }
  | {
      state: "unlocked";
      vault: DecryptedVault;
      remainingMs: number;
      minutes: number;
      offer: SaveOffer | null;
    };

export type UnlockResponse = Status | { state: "wrong-password" } | { state: "needs-upgrade" };

export type SaveResponse = { ok: true } | { ok: false; error: string };

/** Send a request to the background worker and wait for its answer. */
export function send<T>(request: Request): Promise<T> {
  return ext.runtime.sendMessage(request) as Promise<T>;
}
