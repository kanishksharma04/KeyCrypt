import { describe, it, expect } from "vitest";
import {
  generatePassword,
  getPasswordStrength,
  DEFAULT_PASSWORD_OPTIONS,
  type PasswordOptions,
} from "../password-generator";

const ALL: PasswordOptions = {
  length: 20,
  lowercase: true,
  uppercase: true,
  numbers: true,
  symbols: true,
};
const LOWER_ONLY: PasswordOptions = {
  length: 20,
  lowercase: true,
  uppercase: false,
  numbers: false,
  symbols: false,
};

describe("generatePassword", () => {
  it("returns the requested length", () => {
    expect(generatePassword({ ...ALL, length: 16 })).toHaveLength(16);
    expect(generatePassword({ ...ALL, length: 32 })).toHaveLength(32);
    expect(generatePassword({ ...ALL, length: 64 })).toHaveLength(64);
  });

  it("contains at least one char from each active charset", () => {
    const pw = generatePassword(ALL);
    expect(/[a-z]/.test(pw)).toBe(true);
    expect(/[A-Z]/.test(pw)).toBe(true);
    expect(/[0-9]/.test(pw)).toBe(true);
    expect(/[!@#$%^&*()[\]{}|;:,.<>?\-_=+]/.test(pw)).toBe(true);
  });

  it("respects disabled charsets", () => {
    const pw = generatePassword({ ...ALL, symbols: false, numbers: false });
    expect(/[0-9]/.test(pw)).toBe(false);
    expect(/[!@#$%^&*()[\]{}|;:,.<>?\-_=+]/.test(pw)).toBe(false);
  });

  it("falls back to lowercase when no charset is active", () => {
    const pw = generatePassword({
      ...ALL,
      lowercase: false,
      uppercase: false,
      numbers: false,
      symbols: false,
    });
    expect(/^[a-z]+$/.test(pw)).toBe(true);
  });

  it("produces different passwords on successive calls", () => {
    const a = generatePassword(ALL);
    const b = generatePassword(ALL);
    // Astronomically unlikely to collide
    expect(a).not.toBe(b);
  });

  it("only uses chars from lowercase pool when only lowercase enabled", () => {
    const pw = generatePassword(LOWER_ONLY);
    expect(/^[a-z]+$/.test(pw)).toBe(true);
  });
});

describe("getPasswordStrength", () => {
  it("returns Strong for long all-charset passwords", () => {
    const s = getPasswordStrength({ ...ALL, length: 20 });
    expect(s.label).toBe("Strong");
    expect(s.level).toBe(3);
    expect(s.bits).toBeGreaterThan(80);
  });

  it("returns Weak for very short passwords", () => {
    const s = getPasswordStrength({ ...LOWER_ONLY, length: 6 });
    expect(s.label).toBe("Weak");
    expect(s.level).toBe(0);
  });

  it("entropy scales with length", () => {
    const short = getPasswordStrength({ ...ALL, length: 8 });
    const long = getPasswordStrength({ ...ALL, length: 32 });
    expect(long.bits).toBeGreaterThan(short.bits);
  });

  it("entropy is correct formula: length * log2(poolSize)", () => {
    // lowercase only: pool = 26
    const s = getPasswordStrength({ ...LOWER_ONLY, length: 10 });
    expect(s.bits).toBeCloseTo(10 * Math.log2(26), 5);
  });

  it("matches DEFAULT_PASSWORD_OPTIONS with Strong", () => {
    const s = getPasswordStrength(DEFAULT_PASSWORD_OPTIONS);
    expect(s.label).toBe("Strong");
  });
});
