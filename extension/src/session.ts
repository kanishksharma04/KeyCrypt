// The unlocked vault, held in the background service worker's memory only
// (pure; unit-tested with a fake clock). Never written to chrome.storage: a
// CryptoKey can't be serialised there anyway, and the worker's memory is gone
// when the browser closes.

export const DEFAULT_UNLOCK_MINUTES = 10;
/** Choices offered in the popup. */
export const UNLOCK_MINUTE_CHOICES = [1, 5, 10, 30, 60] as const;

export function clampUnlockMinutes(value: unknown): number {
  const n = Number(value);
  return (UNLOCK_MINUTE_CHOICES as readonly number[]).includes(n) ? n : DEFAULT_UNLOCK_MINUTES;
}

export class VaultSession {
  private key: CryptoKey | null = null;
  private userId: string | null = null;
  private expiresAt = 0;

  /** Keep `key` for `minutes` from `now`. */
  unlock(key: CryptoKey, userId: string, minutes: number, now: number): void {
    this.key = key;
    this.userId = userId;
    this.expiresAt = now + clampUnlockMinutes(minutes) * 60_000;
  }

  /** The key while it hasn't expired; clears it once it has. */
  get(now: number): { key: CryptoKey; userId: string } | null {
    if (!this.key || !this.userId) return null;
    if (now >= this.expiresAt) {
      this.lock();
      return null;
    }
    return { key: this.key, userId: this.userId };
  }

  /** Milliseconds until the key is dropped (0 when locked). */
  remaining(now: number): number {
    return this.get(now) ? this.expiresAt - now : 0;
  }

  lock(): void {
    this.key = null;
    this.userId = null;
    this.expiresAt = 0;
  }
}

/** A login the user just submitted on a page, waiting for "Save" in the popup. */
export interface PendingLogin {
  tabId: number;
  url: string;
  host: string;
  username: string;
  password: string;
  at: number;
}

/** How long a submitted login waits to be saved, in memory only. */
export const PENDING_LOGIN_TTL_MS = 5 * 60_000;

/** Submitted logins per tab, dropped after PENDING_LOGIN_TTL_MS. */
export class PendingLogins {
  private byTab = new Map<number, PendingLogin>();

  set(login: PendingLogin): void {
    this.byTab.set(login.tabId, login);
  }

  get(tabId: number, now: number): PendingLogin | null {
    const login = this.byTab.get(tabId);
    if (!login) return null;
    if (now - login.at >= PENDING_LOGIN_TTL_MS) {
      this.byTab.delete(tabId);
      return null;
    }
    return login;
  }

  delete(tabId: number): void {
    this.byTab.delete(tabId);
  }

  /** Drop expired entries; returns the tab ids that were dropped. */
  sweep(now: number): number[] {
    const dropped: number[] = [];
    for (const [tabId, login] of this.byTab) {
      if (now - login.at >= PENDING_LOGIN_TTL_MS) {
        this.byTab.delete(tabId);
        dropped.push(tabId);
      }
    }
    return dropped;
  }

  clear(): void {
    this.byTab.clear();
  }
}
