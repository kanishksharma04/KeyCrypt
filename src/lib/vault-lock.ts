// When to auto-lock the vault. Pure so it can be unit tested; the timers and
// event listeners live in src/providers/vault-lock-provider.tsx.
//
// Decisions compare wall-clock timestamps instead of trusting a single long
// setTimeout: timers pause while a laptop sleeps and are throttled in hidden
// tabs, but Date.now() keeps moving, so the first check after waking sees the
// real elapsed time and locks.

/** Lock after this long with no user activity. */
export const INACTIVITY_MS = 15 * 60 * 1000;
/** Lock after the tab has been hidden (another tab, minimised) this long. */
export const HIDDEN_LOCK_MS = 5 * 60 * 1000;
/** How often the provider re-evaluates shouldLock(). */
export const LOCK_CHECK_INTERVAL_MS = 30 * 1000;
/** Record pointer/scroll activity at most this often. */
export const ACTIVITY_THROTTLE_MS = 1000;

/**
 * @param now            current time (ms since epoch)
 * @param lastActivityAt last user activity (ms since epoch)
 * @param hiddenAt       when the tab became hidden, or null if it is visible
 */
export function shouldLock(now: number, lastActivityAt: number, hiddenAt: number | null): boolean {
  if (now - lastActivityAt > INACTIVITY_MS) return true;
  if (hiddenAt !== null && now - hiddenAt > HIDDEN_LOCK_MS) return true;
  return false;
}
