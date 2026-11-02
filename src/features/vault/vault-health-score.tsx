"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Clock, Loader2, RefreshCw, ShieldCheck, ShieldX } from "lucide-react";
import {
  countPasswordBreaches,
  getVaultKey,
  isVaultUnlocked,
  loadPasswordStrengthEstimator,
} from "@/lib/crypto";
import { Button } from "@/components/ui/button";
import { openItem } from "./item-payload";
import { useVaultUserId } from "@/providers/vault-user-provider";
import { computeVaultHealth, type VaultHealth } from "@/lib/vault-health";
import { getLoginItemsForHealthAction } from "@/server/settings-actions";
import type { LoginSecret } from "@/types/vault";
import { cn } from "@/lib/utils";

const REASON_META = {
  breached: { label: "Found in a data breach", Icon: ShieldX, color: "text-red-600" },
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

type BreachCheck =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "done" }
  | { status: "error"; message: string };

/** Fetch and decrypt every login's name and password, in the browser. */
async function loadLoginSecrets(key: CryptoKey, userId: string) {
  const res = await getLoginItemsForHealthAction();
  if ("error" in res) return null;
  const decrypted = await Promise.all(
    res.map(async (row) => {
      try {
        const { name, secret } = await openItem<LoginSecret>(
          key,
          { ...row, type: "LOGIN" },
          userId
        );
        return { id: row.id, name, password: secret.password, updatedAt: row.updatedAt };
      } catch {
        // Skip items that fail to decrypt rather than let one bad item block the score.
        return null;
      }
    })
  );
  return decrypted.filter((d): d is NonNullable<typeof d> => d !== null);
}

/** zxcvbn is lazy-loaded; if it can't load, the built-in estimate is used. */
function loadStrengthEstimator(): Promise<void> {
  return loadPasswordStrengthEstimator().catch(() => undefined);
}

export function VaultHealthScore() {
  const userId = useVaultUserId();
  const [state, setState] = useState<HealthState | null>(null);
  // Derive the initial value synchronously — avoids a setState call inside the
  // effect body for the "vault locked, nothing to fetch" branch.
  const [loading, setLoading] = useState(() => isVaultUnlocked());

  const [breachCheck, setBreachCheck] = useState<BreachCheck>({ status: "idle" });

  useEffect(() => {
    const key = getVaultKey();
    if (!key) return;

    void Promise.all([loadLoginSecrets(key, userId), loadStrengthEstimator()]).then(([logins]) => {
      if (logins) setState({ health: computeVaultHealth(logins) });
      setLoading(false);
    });
  }, [userId]);

  // Opt-in: only 5-character SHA-1 prefixes leave the browser (see breach.ts).
  async function checkBreaches() {
    const key = getVaultKey();
    if (!key) return;
    setBreachCheck({ status: "checking" });
    try {
      const logins = await loadLoginSecrets(key, userId);
      if (!logins) throw new Error("load failed");
      const counts = await countPasswordBreaches(logins.map((l) => l.password));
      const breaches = new Map(logins.map((l, i) => [l.id, counts[i] ?? 0]));
      setState({ health: computeVaultHealth(logins, breaches) });
      setBreachCheck({ status: "done" });
    } catch {
      setBreachCheck({
        status: "error",
        message: "Couldn't check right now. Try again later.",
      });
    }
  }

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
              : [
                  ...(health.breachedCount ? [`${health.breachedCount} breached`] : []),
                  `${health.weakCount} weak`,
                  `${health.reusedCount} reused`,
                  `${health.oldCount} stale`,
                ].join(" · ")}
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

      <div className="mt-4 space-y-2 border-t pt-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void checkBreaches()}
            disabled={breachCheck.status === "checking"}
          >
            {breachCheck.status === "checking" ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <ShieldX className="size-3.5" aria-hidden="true" />
            )}
            Check for breached passwords
          </Button>
          <p role="status" className="text-xs">
            {breachCheck.status === "done" &&
              (health.breachedCount
                ? `${health.breachedCount} of your passwords appeared in known data breaches. Change them.`
                : "None of your passwords appear in known data breaches.")}
            {breachCheck.status === "error" && (
              <span className="text-destructive">{breachCheck.message}</span>
            )}
          </p>
        </div>
        <p className="text-muted-foreground text-xs">
          Checks your passwords against Have I Been Pwned&apos;s Pwned Passwords list. Each password
          is hashed (SHA-1) in this browser and only the first 5 characters of the hash are sent to
          api.pwnedpasswords.com; the matches that come back are compared here. Your passwords and
          their full hashes never leave this device, and KeyCrypt&apos;s server isn&apos;t involved.
        </p>
      </div>
    </div>
  );
}
