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
  const r = 10.5;
  const circumference = 2 * Math.PI * r;

  return (
    <div>
      <p className="text-faint mb-1.5 text-xs font-semibold">{label}</p>
      <div className="bg-secondary flex items-center gap-2 rounded-[10px] border py-2 pr-2 pl-3.5">
        <p
          className="flex-1 font-mono text-xl font-semibold tracking-[0.08em] tabular-nums"
          data-testid="totp-code"
          aria-live="polite"
        >
          {formatCode(code)}
        </p>
        <span
          className="relative flex size-[26px] items-center justify-center"
          role="timer"
          aria-label={`Changes in ${secondsLeft} seconds`}
        >
          <svg viewBox="0 0 26 26" className="absolute size-[26px] -rotate-90" aria-hidden="true">
            <circle cx="13" cy="13" r={r} strokeWidth="3" className="stroke-border fill-none" />
            <circle
              cx="13"
              cy="13"
              r={r}
              strokeWidth="3"
              strokeLinecap="round"
              stroke="currentColor"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - fraction)}
              className={secondsLeft <= 5 ? "text-destructive fill-none" : "text-brand fill-none"}
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
          className="text-faint hover:text-foreground"
          onClick={() => void copyToClipboard(currentTotpCode(params).code)}
        >
          <Copy className="size-[15px]" strokeWidth={1.6} aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
