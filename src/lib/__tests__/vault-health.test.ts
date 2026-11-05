import { beforeAll, describe, it, expect } from "vitest";
import { loadPasswordStrengthEstimator } from "@/lib/crypto";
import { computeVaultHealth } from "../vault-health";

// Vault health runs with zxcvbn loaded, as in the app.
beforeAll(() => loadPasswordStrengthEstimator());

const NOW = new Date().toISOString();
const OLD = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();

describe("computeVaultHealth", () => {
  it("returns a perfect score for an empty vault", () => {
    const health = computeVaultHealth([]);
    expect(health).toEqual({
      total: 0,
      score: 100,
      weakCount: 0,
      reusedCount: 0,
      oldCount: 0,
      breachedCount: null,
      issues: [],
    });
  });

  it("returns a perfect score when every item is strong, unique, and recent", () => {
    const health = computeVaultHealth([
      { id: "1", name: "GitHub", password: "Tr0ub4dor&3xtraLong!Pw", updatedAt: NOW },
      { id: "2", name: "Google", password: "Zx9!qLmP7&Tr2^Wc4nBv6y", updatedAt: NOW },
    ]);
    expect(health.score).toBe(100);
    expect(health.issues).toHaveLength(0);
  });

  it("flags a short lowercase password as weak", () => {
    const health = computeVaultHealth([
      { id: "1", name: "Legacy site", password: "abc", updatedAt: NOW },
    ]);
    expect(health.weakCount).toBe(1);
    expect(health.issues[0]).toMatchObject({ itemId: "1", reason: "weak" });
  });

  it("flags every item sharing the same password as reused", () => {
    const health = computeVaultHealth([
      { id: "1", name: "Site A", password: "SamePwdXYZ123!", updatedAt: NOW },
      { id: "2", name: "Site B", password: "SamePwdXYZ123!", updatedAt: NOW },
      { id: "3", name: "Site C", password: "UniquePwdABC456?", updatedAt: NOW },
    ]);
    expect(health.reusedCount).toBe(2);
    expect(
      health.issues
        .filter((i) => i.reason === "reused")
        .map((i) => i.itemId)
        .sort()
    ).toEqual(["1", "2"]);
  });

  it("doesn't flag logins without a password as weak, reused or breached", () => {
    const health = computeVaultHealth(
      [
        { id: "1", name: "SSO app", password: "", updatedAt: NOW },
        { id: "2", name: "TOTP only", password: "", updatedAt: NOW },
      ],
      new Map([
        ["1", 5],
        ["2", 5],
      ])
    );
    expect(health.issues).toEqual([]);
    expect(health.score).toBe(100);
  });

  it("flags a password untouched for over a year as old", () => {
    const health = computeVaultHealth([
      { id: "1", name: "Ancient account", password: "Zx9!qLmP7&Tr2^Wc4nBv6y", updatedAt: OLD },
    ]);
    expect(health.oldCount).toBe(1);
    expect(health.issues[0]).toMatchObject({ itemId: "1", reason: "old" });
  });

  it("computes a ratio-weighted score across mixed issues", () => {
    const health = computeVaultHealth([
      { id: "a", name: "Weak one", password: "abc", updatedAt: NOW },
      { id: "b", name: "Reused one", password: "SamePwdXYZ123!", updatedAt: NOW },
      { id: "c", name: "Reused two", password: "SamePwdXYZ123!", updatedAt: NOW },
      { id: "d", name: "Old one", password: "Zx9!qLmP7&Tr2^Wc4nBv6y", updatedAt: OLD },
    ]);
    // penalty = (1/4)*30 + (2/4)*25 + (1/4)*10 = 7.5 + 12.5 + 2.5 = 22.5 → score 78
    expect(health.total).toBe(4);
    expect(health.weakCount).toBe(1);
    expect(health.reusedCount).toBe(2);
    expect(health.oldCount).toBe(1);
    expect(health.breachedCount).toBeNull();
    expect(health.score).toBe(78);
  });

  it("flags a common password zxcvbn sees through, even with all character classes", () => {
    const health = computeVaultHealth([
      { id: "1", name: "Router", password: "P@ssw0rd!", updatedAt: NOW },
    ]);
    expect(health.weakCount).toBe(1);
  });

  it("includes breached passwords in the issues and the score", () => {
    const items = [
      { id: "1", name: "Forum", password: "Zx9!qLmP7&Tr2^Wc4nBv6y", updatedAt: NOW },
      { id: "2", name: "Bank", password: "Tr0ub4dor&3xtraLong!Pw", updatedAt: NOW },
    ];
    const health = computeVaultHealth(
      items,
      new Map([
        ["1", 12],
        ["2", 0],
      ])
    );
    expect(health.breachedCount).toBe(1);
    expect(health.issues).toEqual([{ itemId: "1", name: "Forum", reason: "breached" }]);
    // penalty = (1/2)*35 = 17.5 → 82.5 → 83
    expect(health.score).toBe(83);

    // Checked and clean: 0, not null.
    expect(computeVaultHealth(items, new Map()).breachedCount).toBe(0);
    expect(computeVaultHealth([], new Map()).breachedCount).toBe(0);
  });

  it("lists breached issues first", () => {
    const health = computeVaultHealth(
      [
        { id: "a", name: "Weak", password: "abc", updatedAt: NOW },
        { id: "b", name: "Breached", password: "Zx9!qLmP7&Tr2^Wc4nBv6y", updatedAt: OLD },
      ],
      new Map([["b", 3]])
    );
    expect(health.issues.map((i) => i.reason)).toEqual(["breached", "weak", "old"]);
  });

  it("never scores below 0", () => {
    const health = computeVaultHealth([
      { id: "1", name: "Bad", password: "abc", updatedAt: OLD },
      { id: "2", name: "Also bad", password: "abc", updatedAt: OLD },
    ]);
    expect(health.score).toBeGreaterThanOrEqual(0);
  });
});
