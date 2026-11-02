// Client-side vault health scoring. Operates only on already-decrypted
// login secrets — never touches the server, keeps the zero-knowledge model intact.
// Call loadPasswordStrengthEstimator() first so weak passwords are judged by zxcvbn.

import { estimatePasswordStrength } from "@/lib/crypto";

const OLD_THRESHOLD_MS = 365 * 24 * 60 * 60 * 1000;

export interface VaultHealthIssue {
  itemId: string;
  name: string;
  reason: "breached" | "weak" | "reused" | "old";
}

export interface VaultHealth {
  total: number;
  score: number; // 0-100
  weakCount: number;
  reusedCount: number;
  oldCount: number;
  /** null until the user runs the opt-in breached-password check. */
  breachedCount: number | null;
  issues: VaultHealthIssue[];
}

interface HealthInput {
  id: string;
  name: string;
  password: string;
  updatedAt: string;
}

// Most serious first; the dashboard shows the top few.
const SEVERITY: Record<VaultHealthIssue["reason"], number> = {
  breached: 0,
  weak: 1,
  reused: 2,
  old: 3,
};

/**
 * Score decrypted logins. `breaches` (item id → times seen in breaches) comes
 * from the opt-in Pwned Passwords check; leave it out if that hasn't run.
 */
export function computeVaultHealth(
  items: HealthInput[],
  breaches?: ReadonlyMap<string, number>
): VaultHealth {
  if (items.length === 0) {
    return {
      total: 0,
      score: 100,
      weakCount: 0,
      reusedCount: 0,
      oldCount: 0,
      breachedCount: breaches ? 0 : null,
      issues: [],
    };
  }

  const passwordCounts = new Map<string, number>();
  for (const item of items) {
    passwordCounts.set(item.password, (passwordCounts.get(item.password) ?? 0) + 1);
  }

  const now = Date.now();
  const issues: VaultHealthIssue[] = [];

  for (const item of items) {
    if ((breaches?.get(item.id) ?? 0) > 0) {
      issues.push({ itemId: item.id, name: item.name, reason: "breached" });
    }
    if (estimatePasswordStrength(item.password).level === 0) {
      issues.push({ itemId: item.id, name: item.name, reason: "weak" });
    }
    if ((passwordCounts.get(item.password) ?? 0) > 1) {
      issues.push({ itemId: item.id, name: item.name, reason: "reused" });
    }
    if (now - new Date(item.updatedAt).getTime() > OLD_THRESHOLD_MS) {
      issues.push({ itemId: item.id, name: item.name, reason: "old" });
    }
  }

  issues.sort((a, b) => SEVERITY[a.reason] - SEVERITY[b.reason]);

  const breached = issues.filter((i) => i.reason === "breached").length;
  const weakCount = issues.filter((i) => i.reason === "weak").length;
  const reusedCount = issues.filter((i) => i.reason === "reused").length;
  const oldCount = issues.filter((i) => i.reason === "old").length;

  // Ratio-weighted, not a flat per-item deduction — a vault with one weak
  // password out of fifty shouldn't score the same as one where every item is weak.
  // A password found in a breach is the most urgent fix.
  const penalty =
    (breached / items.length) * 35 +
    (weakCount / items.length) * 30 +
    (reusedCount / items.length) * 25 +
    (oldCount / items.length) * 10;
  const score = Math.max(0, Math.min(100, Math.round(100 - penalty)));

  return {
    total: items.length,
    score,
    weakCount,
    reusedCount,
    oldCount,
    breachedCount: breaches ? breached : null,
    issues,
  };
}
