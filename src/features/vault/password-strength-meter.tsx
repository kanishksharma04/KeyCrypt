"use client";

import { useEffect, useState } from "react";
import {
  estimatePasswordStrength,
  isPasswordStrengthEstimatorLoaded,
  loadPasswordStrengthEstimator,
} from "@/lib/crypto";
import { cn } from "@/lib/utils";

// The one strength meter for typed passwords (master password setup and
// change, and a login's password). Scores come from the shared estimatePasswordStrength in
// @/lib/crypto, the same function vault health uses.

const BAR_COLORS = ["bg-destructive", "bg-orange-500", "bg-yellow-500", "bg-emerald-500"] as const;

/**
 * Starts loading zxcvbn (lazy) and re-renders once it is ready, so the meter
 * switches from the built-in estimate to zxcvbn's verdict.
 */
function useStrengthEstimator(): void {
  const [, setReady] = useState(isPasswordStrengthEstimatorLoaded);
  useEffect(() => {
    if (isPasswordStrengthEstimatorLoaded()) return;
    let active = true;
    loadPasswordStrengthEstimator().then(
      () => active && setReady(true),
      () => undefined // keep the built-in estimate
    );
    return () => {
      active = false;
    };
  }, []);
}

export function PasswordStrengthMeter({ password }: { password: string }) {
  useStrengthEstimator();

  // Keep the layout stable while the field is empty.
  if (!password) return <div className="h-7" />;

  const { level, label } = estimatePasswordStrength(password);
  // Levels 0–3 (Weak..Strong) fill 1–4 segments.
  const filled = level + 1;

  return (
    <div className="space-y-1">
      <div
        className="flex gap-1"
        role="meter"
        aria-label={`Password strength: ${label}`}
        aria-valuenow={filled}
        aria-valuemin={1}
        aria-valuemax={4}
      >
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors duration-300",
              filled >= i ? BAR_COLORS[level] : "bg-muted"
            )}
          />
        ))}
      </div>
      <p className="text-muted-foreground text-xs">{label}</p>
    </div>
  );
}
