"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Clock, RefreshCw, ShieldCheck } from "lucide-react";
import { getVaultKey, isVaultUnlocked, decryptItem } from "@/lib/crypto";
import { computeVaultHealth, type VaultHealth } from "@/lib/vault-health";
import { getLoginItemsForHealthAction } from "@/server/settings-actions";
import type { LoginSecret } from "@/types/vault";
import { cn } from "@/lib/utils";

const REASON_META = {
  weak: { label: "Weak password", Icon: AlertTriangle, color: "text-red-500" },
  reused: { label: "Reused password", Icon: RefreshCw, color: "text-amber-500" },
  old: { label: "Not updated in a year", Icon: Clock, color: "text-muted-foreground" },
} as const;

const MAX_VISIBLE_ISSUES = 5;

function ScoreRing({ score }: { score: number }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const ringColor =
    score >= 80 ? "text-green-500" : score >= 50 ? "text-amber-500" : "text-red-500";

  return (
    <div className="relative flex size-24 shrink-0 items-center justify-center">
      <svg viewBox="0 0 100 100" className="size-24 -rotate-90">
        <circle cx="50" cy="50" r={radius} strokeWidth="8" className="stroke-muted fill-none" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          strokeWidth="8"
          strokeLinecap="round"
          stroke="currentColor"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn("fill-none transition-all duration-700 ease-out", ringColor)}
        />
      </svg>
      <span className="absolute text-xl font-black tabular-nums">{score}</span>
    </div>
  );
}

interface HealthState {
  health: VaultHealth;
}

export function VaultHealthScore() {
  const [state, setState] = useState<HealthState | null>(null);
  // Derive the initial value synchronously — avoids a setState call inside the
  // effect body for the "vault locked, nothing to fetch" branch.
  const [loading, setLoading] = useState(() => isVaultUnlocked());

  useEffect(() => {
    const key = getVaultKey();
    if (!key) return;

    void getLoginItemsForHealthAction().then(async (res) => {
      if ("error" in res) {
        setLoading(false);
        return;
      }

      const decrypted = (
        await Promise.all(
          res.map(async (row) => {
            try {
              const secret = await decryptItem<LoginSecret>(key, {
                ciphertext: row.ciphertext,
                iv: row.iv,
              });
              return {
                id: row.id,
                name: row.name,
                password: secret.password,
                updatedAt: row.updatedAt,
              };
            } catch {
              // Skip items that fail to decrypt rather than let one bad item block the score.
              return null;
            }
          })
        )
      ).filter((d): d is NonNullable<typeof d> => d !== null);

      setState({ health: computeVaultHealth(decrypted) });
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <div className="bg-card h-32 animate-pulse rounded-xl border" aria-hidden="true" />;
  }

  if (!state) return null;
  const { health } = state;

  if (health.total === 0) {
    return (
      <div className="bg-card flex items-center gap-3 rounded-xl border border-dashed p-5">
        <ShieldCheck className="text-muted-foreground size-6 shrink-0" aria-hidden="true" />
        <p className="text-muted-foreground text-sm">
          Add a login item to see your vault health score.
        </p>
      </div>
    );
  }

  const topIssues = health.issues.slice(0, MAX_VISIBLE_ISSUES);

  return (
    <div className="bg-card rounded-xl border p-5">
      <div className="flex items-center gap-5">
        <ScoreRing score={health.score} />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Vault health</h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {health.issues.length === 0
              ? "No issues found — your logins look strong."
              : `${health.weakCount} weak · ${health.reusedCount} reused · ${health.oldCount} stale`}
          </p>
        </div>
        {health.score === 100 && (
          <ShieldCheck className="size-8 shrink-0 text-green-500" aria-hidden="true" />
        )}
      </div>

      {topIssues.length > 0 && (
        <ul className="mt-4 space-y-1 border-t pt-4">
          {topIssues.map((issue, i) => {
            const { label, Icon, color } = REASON_META[issue.reason];
            return (
              <li key={`${issue.itemId}-${issue.reason}-${i}`}>
                <Link
                  href={`/vault?open=${issue.itemId}`}
                  className="hover:bg-accent/50 flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors"
                >
                  <Icon className={cn("size-3.5 shrink-0", color)} aria-hidden="true" />
                  <span className="truncate font-medium">{issue.name}</span>
                  <span className="text-muted-foreground ml-auto shrink-0 text-xs">{label}</span>
                </Link>
              </li>
            );
          })}
          {health.issues.length > topIssues.length && (
            <li className="text-muted-foreground px-2 pt-1 text-xs">
              +{health.issues.length - topIssues.length} more
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
