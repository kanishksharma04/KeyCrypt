"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Clock, Copy, Loader2, ShieldCheck, ShieldX } from "lucide-react";
import { AuthenticatorIcon } from "@/components/shared/design-icons";
import {
  countPasswordBreaches,
  getVaultKey,
  isVaultUnlocked,
  loadPasswordStrengthEstimator,
} from "@/lib/crypto";
import { openItem } from "./item-payload";
import { useVaultUserId } from "@/providers/vault-user-provider";
import { computeVaultHealth, type VaultHealth } from "@/lib/vault-health";
import { getLoginItemsForHealthAction } from "@/server/settings-actions";
import type { LoginSecret } from "@/types/vault";
import { cn } from "@/lib/utils";

const REASON_META = {
  breached: { label: "Found in a data breach", Icon: ShieldX, color: "text-destructive" },
  weak: { label: "Weak password", Icon: AlertTriangle, color: "text-warning" },
  reused: { label: "Reused password", Icon: Copy, color: "text-warning" },
  old: { label: "Not updated in a year", Icon: Clock, color: "text-warning" },
  no2fa: { label: "No 2FA code saved", Icon: AuthenticatorIcon, color: "text-warning" },
} as const;

type Reason = keyof typeof REASON_META;

const MAX_LISTED_ISSUES = 8;

function rating(score: number) {
  if (score >= 80) return { word: "Good", color: "text-success" };
  if (score >= 50) return { word: "Fair", color: "text-warning" };
  return { word: "Poor", color: "text-destructive" };
}

function ScoreRing({ score }: { score: number }) {
  // 130px ring, 10px stroke, as in the design.
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const ringColor =
    score >= 80 ? "text-success" : score >= 50 ? "text-warning" : "text-destructive";

  return (
    <div className="relative flex size-[130px] shrink-0 items-center justify-center">
      <svg viewBox="0 0 130 130" className="size-[130px] -rotate-90" aria-hidden="true">
        <circle cx="65" cy="65" r={radius} strokeWidth="10" className="stroke-muted fill-none" />
        <circle
          cx="65"
          cy="65"
          r={radius}
          strokeWidth="10"
          strokeLinecap="round"
          stroke="currentColor"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn("fill-none transition-all duration-700 ease-out", ringColor)}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-serif text-[32px] leading-none font-semibold tabular-nums">
          {score}
        </span>
        <span className="text-faint mt-1 text-[11px]">out of 100</span>
      </div>
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
        return {
          id: row.id,
          name,
          password: secret.password,
          updatedAt: row.updatedAt,
          hasTotp: !!secret.totp?.trim(),
        };
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
  const [review, setReview] = useState<ReadonlySet<Reason>>(new Set());

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
      // Logins without a password have nothing to look up.
      const withPassword = logins.filter((l) => l.password);
      const counts = await countPasswordBreaches(withPassword.map((l) => l.password));
      const breaches = new Map(withPassword.map((l, i) => [l.id, counts[i] ?? 0]));
      const health = computeVaultHealth(logins, breaches);
      setState({ health });
      setBreachCheck({ status: "done" });
      if (health.breachedCount) setReview((r) => new Set(r).add("breached"));
    } catch {
      setBreachCheck({
        status: "error",
        message: "Couldn't check right now. Try again later.",
      });
    }
  }

  if (loading) {
    return (
      <div
        className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"
        aria-hidden="true"
      >
        <div className="bg-card h-60 animate-pulse rounded-[16px] border" />
        <div className="bg-card h-60 animate-pulse rounded-[16px] border" />
      </div>
    );
  }

  if (!state) return null;
  const { health } = state;

  if (health.total === 0) {
    return (
      <div className="bg-card flex items-center gap-3 rounded-[16px] border border-dashed p-6">
        <ShieldCheck className="text-muted-foreground size-6 shrink-0" aria-hidden="true" />
        <div>
          <h2 className="text-sm font-semibold">Vault health</h2>
          <p className="text-muted-foreground text-sm">
            Add a login item to see your vault health score.
          </p>
        </div>
      </div>
    );
  }

  const { word, color } = rating(health.score);
  const factors: Array<{ reason: Reason; label: string; count: number | null }> = [
    { reason: "weak", label: "Weak passwords", count: health.weakCount },
    { reason: "reused", label: "Reused passwords", count: health.reusedCount },
    { reason: "breached", label: "Breached passwords", count: health.breachedCount },
    { reason: "no2fa", label: "Logins without a 2FA code saved", count: health.missingTotpCount },
    // Shown only when it applies; it still counts towards the score.
    ...(health.oldCount > 0
      ? [{ reason: "old" as const, label: "Not updated in a year", count: health.oldCount }]
      : []),
  ];

  function toggleReview(reason: Reason) {
    setReview((r) => {
      const next = new Set(r);
      if (next.has(reason)) next.delete(reason);
      else next.add(reason);
      return next;
    });
  }

  const linkClass = "text-brand rounded text-[13px] underline-offset-4 hover:underline";

  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      {/* Score */}
      <section className="bg-card flex min-w-0 flex-col items-center justify-center rounded-[16px] border p-6 text-center sm:p-7">
        <ScoreRing score={health.score} />
        <div className="mt-3.5">
          <h2 className={cn("text-[15px] font-semibold", color)}>Vault health: {word}</h2>
          <p className="text-faint mt-1 text-[13px]">
            {health.issues.length === 0
              ? "No issues found. Your logins look strong."
              : health.score >= 80
                ? "A few items could use attention."
                : "Several items need attention."}
          </p>
        </div>
      </section>

      {/* What's affecting it */}
      <section className="bg-card min-w-0 rounded-[16px] border p-5 sm:p-7">
        <h2 className="mb-4 text-sm font-semibold">What&apos;s affecting your score</h2>
        <ul className="divide-y">
          {factors.map(({ reason, label, count }) => {
            const issues = health.issues.filter((i) => i.reason === reason);
            const open = review.has(reason) && issues.length > 0;
            const isBreach = reason === "breached";
            const Icon = isBreach && count === 0 ? ShieldCheck : REASON_META[reason].Icon;
            const iconColor = isBreach
              ? count === null
                ? "text-muted-foreground"
                : count === 0
                  ? "text-success"
                  : "text-destructive"
              : REASON_META[reason].color;
            return (
              <li key={reason} className="py-3">
                <div className="flex min-h-6 items-center gap-3">
                  <Icon
                    className={cn("size-[18px] shrink-0", iconColor)}
                    strokeWidth={1.6}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 text-sm">{label}</span>
                  <span className="text-sm font-semibold tabular-nums">{count ?? "—"}</span>
                  <span className="flex w-[60px] justify-end">
                    {isBreach && (count === null || count === 0) ? (
                      <button
                        type="button"
                        onClick={() => void checkBreaches()}
                        disabled={breachCheck.status === "checking"}
                        aria-label="Check for breached passwords"
                        className={cn(
                          linkClass,
                          "inline-flex items-center gap-1 disabled:opacity-60"
                        )}
                      >
                        {breachCheck.status === "checking" && (
                          <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                        )}
                        {count === null ? "Check" : "Recheck"}
                      </button>
                    ) : issues.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => toggleReview(reason)}
                        aria-expanded={open}
                        className={linkClass}
                      >
                        {open ? "Hide" : "Review"}
                      </button>
                    ) : null}
                  </span>
                </div>

                {isBreach && (
                  <p role="status" className="text-faint mt-1 pl-[30px] text-xs empty:hidden">
                    {breachCheck.status === "idle" &&
                      "Opt-in: only the first 5 characters of each password's SHA-1 hash are sent to Have I Been Pwned."}
                    {breachCheck.status === "done" &&
                      (health.breachedCount
                        ? `${health.breachedCount} of your passwords appeared in known data breaches. Change them.`
                        : "None of your passwords appear in known data breaches.")}
                    {breachCheck.status === "error" && (
                      <span className="text-destructive">{breachCheck.message}</span>
                    )}
                  </p>
                )}

                {open && (
                  <ul className="mt-2 space-y-0.5 pl-5">
                    {issues.slice(0, MAX_LISTED_ISSUES).map((issue, i) => (
                      <li key={`${issue.itemId}-${i}`}>
                        <Link
                          href={`/vault?open=${issue.itemId}`}
                          className="hover:bg-muted flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors"
                        >
                          <span className="truncate font-medium">{issue.name}</span>
                          <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                            {REASON_META[issue.reason].label}
                          </span>
                        </Link>
                      </li>
                    ))}
                    {issues.length > MAX_LISTED_ISSUES && (
                      <li className="text-muted-foreground px-2 pt-1 text-xs">
                        +{issues.length - MAX_LISTED_ISSUES} more
                      </li>
                    )}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
