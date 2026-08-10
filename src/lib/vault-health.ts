// Client-side vault health scoring. Operates only on already-decrypted
// login secrets — never touches the server, keeps the zero-knowledge model intact.

import { estimatePasswordStrength } from "@/lib/crypto";

const OLD_THRESHOLD_MS = 365 * 24 * 60 * 60 * 1000;

export interface VaultHealthIssue {
  itemId: string;
  name: string;
  reason: "weak" | "reused" | "old";
}

export interface VaultHealth {
  total: number;
  score: number; // 0-100
  weakCount: number;
  reusedCount: number;
  oldCount: number;
  issues: VaultHealthIssue[];
}

interface HealthInput {
  id: string;
  name: string;
  password: string;
  updatedAt: string;
}

export function computeVaultHealth(items: HealthInput[]): VaultHealth {
  if (items.length === 0) {
    return { total: 0, score: 100, weakCount: 0, reusedCount: 0, oldCount: 0, issues: [] };
  }

  const passwordCounts = new Map<string, number>();
  for (const item of items) {
    passwordCounts.set(item.password, (passwordCounts.get(item.password) ?? 0) + 1);
  }

  const now = Date.now();
  const issues: VaultHealthIssue[] = [];

  for (const item of items) {
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

  const weakCount = issues.filter((i) => i.reason === "weak").length;
  const reusedCount = issues.filter((i) => i.reason === "reused").length;
  const oldCount = issues.filter((i) => i.reason === "old").length;

  // Ratio-weighted, not a flat per-item deduction — a vault with one weak
  // password out of fifty shouldn't score the same as one where every item is weak.
  const penalty =
    (weakCount / items.length) * 50 +
    (reusedCount / items.length) * 35 +
    (oldCount / items.length) * 15;
  const score = Math.max(0, Math.min(100, Math.round(100 - penalty)));

  return { total: items.length, score, weakCount, reusedCount, oldCount, issues };
}
