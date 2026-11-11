import type { PasswordHistoryEntry } from "@/types/vault";

// Password history for login items. It lives inside the encrypted LOGIN secret
// (no schema change): newest first, at most MAX_PASSWORD_HISTORY entries.

export const MAX_PASSWORD_HISTORY = 10;

const MAX_PASSWORD_LENGTH = 4096; // same limit as the login form

/**
 * The history stored in a decrypted (or imported) secret, validated: anything
 * that isn't a list of { password, changedAt } entries is dropped, so older
 * items and damaged payloads read as an empty history.
 */
export function readPasswordHistory(value: unknown): PasswordHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  const out: PasswordHistoryEntry[] = [];
  for (const entry of value) {
    if (out.length === MAX_PASSWORD_HISTORY) break;
    if (entry === null || typeof entry !== "object") continue;
    const { password, changedAt } = entry as Record<string, unknown>;
    if (typeof password !== "string" || password === "") continue;
    if (password.length > MAX_PASSWORD_LENGTH) continue;
    if (typeof changedAt !== "string" || Number.isNaN(Date.parse(changedAt))) continue;
    out.push({ password, changedAt });
  }
  return out;
}

/**
 * The history after an edit: when the password changed, the old one goes to the
 * front (stamped `now`) and the list is cut to MAX_PASSWORD_HISTORY. Unchanged
 * or previously empty passwords leave the history as it was.
 */
export function nextPasswordHistory(
  history: readonly PasswordHistoryEntry[],
  previousPassword: string,
  newPassword: string,
  now: Date = new Date()
): PasswordHistoryEntry[] {
  const current = readPasswordHistory(history);
  if (!previousPassword || previousPassword === newPassword) return current;
  return [{ password: previousPassword, changedAt: now.toISOString() }, ...current].slice(
    0,
    MAX_PASSWORD_HISTORY
  );
}
