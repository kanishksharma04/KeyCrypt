import { describe, expect, it } from "vitest";
import { HIDDEN_LOCK_MS, INACTIVITY_MS, shouldLock } from "../vault-lock";

const T = Date.UTC(2026, 9, 30, 17, 0, 0);
const MIN = 60 * 1000;

describe("shouldLock: inactivity", () => {
  it("stays unlocked while the user is active", () => {
    expect(shouldLock(T, T, null)).toBe(false);
    expect(shouldLock(T + 14 * MIN, T, null)).toBe(false);
  });

  it("stays unlocked at exactly 15 minutes and locks just after", () => {
    expect(shouldLock(T + INACTIVITY_MS, T, null)).toBe(false);
    expect(shouldLock(T + INACTIVITY_MS + 1, T, null)).toBe(true);
  });
});

describe("shouldLock: hidden tab", () => {
  it("stays unlocked for a short tab switch", () => {
    expect(shouldLock(T + 4 * MIN, T, T)).toBe(false);
  });

  it("locks once hidden for more than 5 minutes, before the inactivity limit", () => {
    expect(shouldLock(T + HIDDEN_LOCK_MS, T, T)).toBe(false);
    expect(shouldLock(T + HIDDEN_LOCK_MS + 1, T, T)).toBe(true);
  });

  it("measures hidden time from when the tab was hidden, not from last activity", () => {
    const hiddenAt = T + 10 * MIN; // active until 10 min, then hidden
    expect(shouldLock(hiddenAt + 4 * MIN, T + 10 * MIN, hiddenAt)).toBe(false);
    expect(shouldLock(hiddenAt + 6 * MIN, T + 10 * MIN, hiddenAt)).toBe(true);
  });

  it("ignores hidden time once the tab is visible again (hiddenAt = null)", () => {
    expect(shouldLock(T + 6 * MIN, T + 6 * MIN, null)).toBe(false);
  });
});

describe("shouldLock: wake after sleep", () => {
  it("locks on the first check after the machine wakes, whatever timers did", () => {
    // Visible tab, laptop lid closed for 2 hours: no timer fired meanwhile.
    expect(shouldLock(T + 120 * MIN, T, null)).toBe(true);
  });

  it("locks after waking even if the tab was hidden only briefly before sleep", () => {
    expect(shouldLock(T + 120 * MIN, T, T + 1 * MIN)).toBe(true);
  });

  it("does not lock after a short sleep within both limits", () => {
    expect(shouldLock(T + 3 * MIN, T, null)).toBe(false);
  });
});
