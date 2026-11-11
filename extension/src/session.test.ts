import { describe, expect, it } from "vitest";
import {
  clampUnlockMinutes,
  DEFAULT_UNLOCK_MINUTES,
  PENDING_LOGIN_TTL_MS,
  PendingLogins,
  VaultSession,
} from "./session";

const KEY = {} as CryptoKey; // a stand-in: the session never looks inside the key
const MIN = 60_000;

describe("VaultSession", () => {
  it("keeps the key for the chosen time, then drops it", () => {
    const session = new VaultSession();
    session.unlock(KEY, "user-1", 10, 0);
    expect(session.get(10 * MIN - 1)).toEqual({ key: KEY, userId: "user-1" });
    expect(session.remaining(9 * MIN)).toBe(MIN);
    expect(session.get(10 * MIN)).toBeNull();
    // Once dropped, it stays dropped.
    expect(session.get(1)).toBeNull();
    expect(session.remaining(1)).toBe(0);
  });

  it("drops the key on lock", () => {
    const session = new VaultSession();
    session.unlock(KEY, "user-1", 30, 0);
    session.lock();
    expect(session.get(1)).toBeNull();
  });

  it(`defaults to ${DEFAULT_UNLOCK_MINUTES} minutes and only allows the offered choices`, () => {
    expect(clampUnlockMinutes(undefined)).toBe(10);
    expect(clampUnlockMinutes("30")).toBe(30);
    expect(clampUnlockMinutes(1)).toBe(1);
    expect(clampUnlockMinutes(1_000_000)).toBe(10);
    expect(clampUnlockMinutes(-5)).toBe(10);

    const session = new VaultSession();
    session.unlock(KEY, "user-1", 9_999, 0);
    expect(session.get(10 * MIN)).toBeNull();
  });
});

describe("PendingLogins", () => {
  const login = (tabId: number, at: number) => ({
    tabId,
    url: "https://example.com/login",
    host: "example.com",
    username: "me",
    password: "pw",
    at,
  });

  it(`keeps a submitted login per tab for ${PENDING_LOGIN_TTL_MS / MIN} minutes`, () => {
    const pending = new PendingLogins();
    pending.set(login(7, 0));
    expect(pending.get(7, PENDING_LOGIN_TTL_MS - 1)?.username).toBe("me");
    expect(pending.get(8, 0)).toBeNull();
    expect(pending.get(7, PENDING_LOGIN_TTL_MS)).toBeNull();
  });

  it("sweeps expired logins and reports their tabs", () => {
    const pending = new PendingLogins();
    pending.set(login(1, 0));
    pending.set(login(2, 4 * MIN));
    expect(pending.sweep(PENDING_LOGIN_TTL_MS)).toEqual([1]);
    expect(pending.get(2, PENDING_LOGIN_TTL_MS)).not.toBeNull();
    pending.clear();
    expect(pending.get(2, PENDING_LOGIN_TTL_MS)).toBeNull();
  });
});
