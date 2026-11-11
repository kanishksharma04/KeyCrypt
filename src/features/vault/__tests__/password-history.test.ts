import { describe, expect, it } from "vitest";
import {
  MAX_PASSWORD_HISTORY,
  nextPasswordHistory,
  readPasswordHistory,
} from "../password-history";

const NOW = new Date("2026-11-11T13:00:00.000Z");
const entry = (password: string, changedAt = "2026-10-01T00:00:00.000Z") => ({
  password,
  changedAt,
});

describe("nextPasswordHistory", () => {
  it("pushes the old password to the front when the password changes", () => {
    expect(nextPasswordHistory([entry("older")], "old", "new", NOW)).toEqual([
      { password: "old", changedAt: "2026-11-11T13:00:00.000Z" },
      entry("older"),
    ]);
  });

  it("keeps the history as it is when the password didn't change, or there was none", () => {
    const history = [entry("older")];
    expect(nextPasswordHistory(history, "same", "same", NOW)).toEqual(history);
    expect(nextPasswordHistory(history, "", "first-password", NOW)).toEqual(history);
    expect(nextPasswordHistory([], "", "first-password", NOW)).toEqual([]);
  });

  it(`keeps at most ${MAX_PASSWORD_HISTORY} entries, dropping the oldest`, () => {
    const full = Array.from({ length: MAX_PASSWORD_HISTORY }, (_, i) => entry(`pw-${i}`));
    const next = nextPasswordHistory(full, "current", "newer", NOW);
    expect(next).toHaveLength(MAX_PASSWORD_HISTORY);
    expect(next[0]?.password).toBe("current");
    expect(next.at(-1)?.password).toBe(`pw-${MAX_PASSWORD_HISTORY - 2}`);
  });
});

describe("readPasswordHistory", () => {
  it("reads missing or malformed history as empty (older items)", () => {
    for (const value of [undefined, null, "pw", 42, {}]) {
      expect(readPasswordHistory(value)).toEqual([]);
    }
  });

  it("drops malformed entries and caps the list", () => {
    expect(
      readPasswordHistory([
        entry("ok"),
        { password: "", changedAt: "2026-10-01T00:00:00.000Z" },
        { password: "no date" },
        { password: "bad date", changedAt: "yesterday" },
        { password: 7, changedAt: "2026-10-01T00:00:00.000Z" },
        null,
        entry("x".repeat(4097)),
      ])
    ).toEqual([entry("ok")]);
    expect(
      readPasswordHistory(Array.from({ length: 15 }, (_, i) => entry(`pw-${i}`)))
    ).toHaveLength(MAX_PASSWORD_HISTORY);
  });
});
