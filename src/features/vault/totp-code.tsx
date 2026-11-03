"use client";

import { useEffect, useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { currentTotpCode, parseTotpInput, type TotpParams } from "@/lib/crypto";
import { copyToClipboard } from "./vault-item-meta";

/** Params for a login's optional otpauth:// link, or null if absent/invalid. */
export function loginTotpParams(totp: string | undefined): TotpParams | null {
  if (!totp) return null;
  try {
    return parseTotpInput(totp);
  } catch {
    return null;
  }
}

function formatCode(code: string): string {
  // 123 456 / 1234 5678, easier to read and type.
  const half = Math.ceil(code.length / 2);
  return `${code.slice(0, half)} ${code.slice(half)}`;
}

/**
 * The live authenticator code with a countdown ring, recomputed every second
 * in the browser. Copying uses copySecret (cleared from the clipboard later).
 */
export function TotpCode({
  params,
  label = "One-time code",
}: {
  params: TotpParams;
  label?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  let current: { code: string; secondsLeft: number };
  try {
    current = currentTotpCode(params, now);
  } catch {
    return <p className="text-destructive text-sm">This authenticator key is damaged.</p>;
  }
  const { code, secondsLeft } = current;
  const fraction = secondsLeft / params.period;
  const r = 9;
  const circumference = 2 * Math.PI * r;

  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</p>
      <div className="flex items-center gap-3">
        <p
          className="flex-1 font-mono text-2xl font-semibold tracking-widest tabular-nums"
          data-testid="totp-code"
          aria-live="polite"
        >
          {formatCode(code)}
        </p>
        <span
          className="relative flex size-6 items-center justify-center"
          role="timer"
          aria-label={`Changes in ${secondsLeft} seconds`}
        >
          <svg viewBox="0 0 24 24" className="absolute size-6 -rotate-90" aria-hidden="true">
            <circle cx="12" cy="12" r={r} strokeWidth="2.5" className="stroke-muted fill-none" />
            <circle
              cx="12"
              cy="12"
              r={r}
              strokeWidth="2.5"
              stroke="currentColor"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - fraction)}
              className={secondsLeft <= 5 ? "fill-none text-red-500" : "fill-none text-cyan-500"}
            />
          </svg>
          <span className="text-[9px] font-semibold tabular-nums">{secondsLeft}</span>
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          title="Copy code"
          aria-label="Copy code"
          // Re-read at click time so a code that just rolled over isn't copied.
          onClick={() => void copyToClipboard(currentTotpCode(params).code)}
        >
          <Copy className="size-3.5" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
