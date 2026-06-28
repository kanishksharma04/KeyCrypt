"use client";

import { useState, useCallback } from "react";
import { Copy, RefreshCw, Wand2 } from "lucide-react";
import { toast } from "sonner";
import {
  generatePassword,
  getPasswordStrength,
  DEFAULT_PASSWORD_OPTIONS,
  type PasswordOptions,
} from "@/lib/crypto";
import { Button, buttonVariants } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// ─── Strength bar ─────────────────────────────────────────────────────────────

const STRENGTH_COLORS = [
  "bg-destructive", // Weak  (0)
  "bg-amber-500", // Fair  (1)
  "bg-yellow-400", // Good  (2)
  "bg-green-500", // Strong (3)
] as const;

function StrengthBar({
  level,
  label,
  bits,
}: {
  level: 0 | 1 | 2 | 3;
  label: string;
  bits: number;
}) {
  return (
    <div className="space-y-1">
      <div className="text-muted-foreground flex items-center justify-between text-xs">
        <span>Strength</span>
        <span>
          <span
            className={cn("font-medium", level >= 2 ? "text-foreground" : "text-muted-foreground")}
          >
            {label}
          </span>
          {" · "}
          {Math.round(bits)} bits
        </span>
      </div>
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors duration-200",
              i <= level ? STRENGTH_COLORS[level] : "bg-muted"
            )}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Generator panel ──────────────────────────────────────────────────────────

interface PasswordGeneratorPanelProps {
  onUse: (password: string) => void;
}

function PasswordGeneratorPanel({ onUse }: PasswordGeneratorPanelProps) {
  const [options, setOptions] = useState<PasswordOptions>(DEFAULT_PASSWORD_OPTIONS);
  const [password, setPassword] = useState(() => generatePassword(DEFAULT_PASSWORD_OPTIONS));

  const refresh = useCallback(
    (opts: PasswordOptions = options) => {
      setPassword(generatePassword(opts));
    },
    [options]
  );

  function updateOption<K extends keyof PasswordOptions>(key: K, value: PasswordOptions[K]) {
    const next = { ...options, [key]: value };
    setOptions(next);
    setPassword(generatePassword(next));
  }

  const strength = getPasswordStrength(options);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(password);
      toast.success("Password copied");
      setTimeout(() => void navigator.clipboard.writeText(""), 30_000);
    } catch {
      toast.error("Failed to copy");
    }
  }

  return (
    <div className="w-72 space-y-4 p-1">
      {/* Generated password display */}
      <div className="bg-muted/50 flex items-center gap-2 rounded-lg border px-3 py-2">
        <p className="min-w-0 flex-1 font-mono text-xs leading-relaxed break-all">{password}</p>
        <div className="flex shrink-0 flex-col gap-1">
          <Button variant="ghost" size="icon-sm" onClick={() => refresh()} title="Regenerate">
            <RefreshCw className="size-3.5" aria-hidden="true" />
            <span className="sr-only">Regenerate</span>
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={handleCopy} title="Copy">
            <Copy className="size-3.5" aria-hidden="true" />
            <span className="sr-only">Copy</span>
          </Button>
        </div>
      </div>

      {/* Strength */}
      <StrengthBar level={strength.level} label={strength.label} bits={strength.bits} />

      {/* Length slider */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <label className="font-medium">Length</label>
          <span className="text-muted-foreground w-6 text-right tabular-nums">
            {options.length}
          </span>
        </div>
        <Slider
          min={8}
          max={64}
          step={1}
          value={[options.length]}
          onValueChange={(v) =>
            updateOption("length", Array.isArray(v) ? (v[0] ?? options.length) : v)
          }
          aria-label="Password length"
        />
      </div>

      {/* Character set toggles */}
      <div className="space-y-2.5">
        {(
          [
            { key: "uppercase", label: "Uppercase (A–Z)" },
            { key: "lowercase", label: "Lowercase (a–z)" },
            { key: "numbers", label: "Numbers (0–9)" },
            { key: "symbols", label: "Symbols (!@#…)" },
          ] as { key: keyof PasswordOptions; label: string }[]
        ).map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between">
            <label htmlFor={`opt-${key}`} className="cursor-pointer text-sm">
              {label}
            </label>
            <Switch
              id={`opt-${key}`}
              checked={options[key] as boolean}
              onCheckedChange={(v) => updateOption(key, v)}
            />
          </div>
        ))}
      </div>

      {/* Use button */}
      <Button className="w-full" size="sm" onClick={() => onUse(password)}>
        Use this password
      </Button>
    </div>
  );
}

// ─── Public: popover trigger ──────────────────────────────────────────────────

interface PasswordGeneratorPopoverProps {
  onUse: (password: string) => void;
}

export function PasswordGeneratorPopover({ onUse }: PasswordGeneratorPopoverProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
        title="Generate password"
        aria-label="Open password generator"
      >
        <Wand2 className="size-3.5" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent className="p-3" align="end" sideOffset={4}>
        <PasswordGeneratorPanel
          onUse={(pw) => {
            onUse(pw);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
