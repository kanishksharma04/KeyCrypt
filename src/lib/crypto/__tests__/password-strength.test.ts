import { describe, expect, it } from "vitest";
import {
  estimatePasswordStrength,
  isPasswordStrengthEstimatorLoaded,
  loadPasswordStrengthEstimator,
} from "@/lib/crypto";

// One module instance per test file: these run in order, before and after
// zxcvbn has been lazy-loaded.

describe("estimatePasswordStrength with lazy zxcvbn", () => {
  it("uses the character-class estimate until zxcvbn is loaded", () => {
    expect(isPasswordStrengthEstimatorLoaded()).toBe(false);
    // 9 chars from all four classes: ~58 bits by charset math alone.
    expect(estimatePasswordStrength("P@ssw0rd!")).toMatchObject({ label: "Fair", level: 1 });
  });

  it("loads once, even when called concurrently", async () => {
    await Promise.all([loadPasswordStrengthEstimator(), loadPasswordStrengthEstimator()]);
    expect(isPasswordStrengthEstimatorLoaded()).toBe(true);
    await expect(loadPasswordStrengthEstimator()).resolves.toBeUndefined();
  });

  it("then sees through common passwords, keyboard walks and l33t", () => {
    for (const pw of ["P@ssw0rd!", "password", "qwertyuiop", "abcdefghij", "Password123!"]) {
      expect(estimatePasswordStrength(pw), pw).toMatchObject({ label: "Weak", level: 0 });
    }
  });

  it.each([
    ["", "Weak", 0],
    ["kT9#mq2", "Fair", 1],
    ["kT9#mq2Lw", "Good", 2],
    ["kT9#mq2Lw4!x", "Strong", 3],
    ["correct horse battery staple", "Strong", 3],
  ] as const)("maps zxcvbn's score for %j to %s", (pw, label, level) => {
    expect(estimatePasswordStrength(pw)).toMatchObject({ label, level });
  });

  it("keeps the { bits, label, level } shape, with bits = log2(guesses)", () => {
    const s = estimatePasswordStrength("kT9#mq2Lw4!x");
    expect(Object.keys(s).sort()).toEqual(["bits", "label", "level"]);
    expect(s.bits).toBeGreaterThan(35);
    expect(estimatePasswordStrength("").bits).toBe(0);
  });

  it("stays fast on very long input (scores a prefix)", () => {
    const start = performance.now();
    expect(estimatePasswordStrength("aB3$".repeat(10_000)).level).toBeGreaterThanOrEqual(0);
    expect(performance.now() - start).toBeLessThan(2_000);
  });
});
