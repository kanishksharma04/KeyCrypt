// All password generation uses crypto.getRandomValues — never Math.random.

const CHARSETS = {
  lowercase: "abcdefghijklmnopqrstuvwxyz",
  uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  numbers: "0123456789",
  symbols: "!@#$%^&*()-_=+[]{}|;:,.<>?",
} as const;

type CharsetKey = keyof typeof CHARSETS;

export interface PasswordOptions {
  length: number;
  lowercase: boolean;
  uppercase: boolean;
  numbers: boolean;
  symbols: boolean;
}

export const DEFAULT_PASSWORD_OPTIONS: PasswordOptions = {
  length: 20,
  lowercase: true,
  uppercase: true,
  numbers: true,
  symbols: true,
};

// Rejection sampling: avoids modulo bias by discarding values that would
// favour the lower end of the character pool.
function secureRandomIndex(max: number): number {
  const limit = Math.floor(256 / max) * max;
  const buf = new Uint8Array(1);
  while (true) {
    globalThis.crypto.getRandomValues(buf);
    // buf[0] is always defined — Uint8Array elements are never undefined
    if ((buf[0] ?? 0) < limit) return (buf[0] ?? 0) % max;
  }
}

// noUncheckedIndexedAccess: index is always in bounds (bounded by string length)
function pick(s: string, i: number): string {
  return s[i]!;
}

export function generatePassword(options: PasswordOptions): string {
  const active = (Object.keys(CHARSETS) as CharsetKey[]).filter((k) => options[k]);
  // Ensure at least one character set is active
  const sets = active.length > 0 ? active : (["lowercase"] as CharsetKey[]);

  const pool = sets.map((k) => CHARSETS[k]).join("");

  // Guarantee one character from each active set, fill the rest from the pool
  const chars: string[] = sets.map((k) => pick(CHARSETS[k], secureRandomIndex(CHARSETS[k].length)));

  while (chars.length < options.length) {
    chars.push(pick(pool, secureRandomIndex(pool.length)));
  }

  // Fisher-Yates shuffle with crypto.getRandomValues
  for (let i = chars.length - 1; i > 0; i--) {
    const j = secureRandomIndex(i + 1);
    const tmp = chars[i]!;
    chars[i] = chars[j]!;
    chars[j] = tmp;
  }

  return chars.join("");
}

export interface PasswordStrength {
  bits: number;
  label: "Weak" | "Fair" | "Good" | "Strong";
  level: 0 | 1 | 2 | 3;
}

export function getPasswordStrength(options: PasswordOptions): PasswordStrength {
  const active = (Object.keys(CHARSETS) as CharsetKey[]).filter((k) => options[k]);
  const poolSize =
    active.length > 0
      ? active.reduce((n, k) => n + CHARSETS[k].length, 0)
      : CHARSETS.lowercase.length;
  const bits = options.length * Math.log2(poolSize);

  if (bits < 40) return { bits, label: "Weak", level: 0 };
  if (bits < 60) return { bits, label: "Fair", level: 1 };
  if (bits < 80) return { bits, label: "Good", level: 2 };
  return { bits, label: "Strong", level: 3 };
}
