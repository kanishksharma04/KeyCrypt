import type { ZxcvbnFactory } from "@zxcvbn-ts/core";
import type { PasswordStrength } from "./password-generator";

// zxcvbn-backed strength estimation for typed (human-chosen) passwords.
//
// The library and its dictionaries (~400 KB) are loaded on demand with
// loadPasswordStrengthEstimator(). Until they arrive, estimatePasswordStrength
// falls back to the character-class estimate, so callers never wait on it.

/** zxcvbn's cost grows with length; longer passwords are scored on their prefix. */
const MAX_CHECKED_LENGTH = 100;

let factory: ZxcvbnFactory | null = null;
let loading: Promise<void> | null = null;

/** Load zxcvbn (once). Safe to call repeatedly; resolves when it is ready. */
export function loadPasswordStrengthEstimator(): Promise<void> {
  if (factory) return Promise.resolve();
  loading ??= Promise.all([import("@zxcvbn-ts/core"), import("@zxcvbn-ts/language-common")])
    .then(([core, common]) => {
      factory = new core.ZxcvbnFactory({
        dictionary: { ...common.dictionary },
        graphs: common.adjacencyGraphs,
        useLevenshteinDistance: true,
      });
    })
    .catch((err: unknown) => {
      loading = null; // allow a retry
      throw err;
    });
  return loading;
}

export function isPasswordStrengthEstimatorLoaded(): boolean {
  return factory !== null;
}

// zxcvbn scores 0–4; 0 and 1 (under ~10^6 guesses) are both "Weak".
const LEVELS = [0, 0, 1, 2, 3] as const;
const LABELS = ["Weak", "Fair", "Good", "Strong"] as const;

/** zxcvbn's verdict in the shared PasswordStrength shape, or null if not loaded. */
export function zxcvbnStrength(password: string): PasswordStrength | null {
  if (!factory) return null;
  const result = factory.check(password.slice(0, MAX_CHECKED_LENGTH));
  const level = LEVELS[result.score] ?? 0;
  return {
    // log2(guesses): an entropy-like figure comparable to the generator's bits.
    bits: result.guessesLog10 * Math.log2(10),
    label: LABELS[level],
    level,
  };
}
