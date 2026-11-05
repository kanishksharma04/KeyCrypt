import { describe, expect, it } from "vitest";
import { activityLabel, describeBrowser } from "../activity";
import { relativeTime } from "../relative-time";

const UA = {
  chromeMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  safariMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  firefoxWin: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0",
  edgeWin:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
};

describe("describeBrowser", () => {
  it.each([
    [UA.chromeMac, "Chrome on macOS"],
    [UA.safariMac, "Safari on macOS"],
    [UA.firefoxWin, "Firefox on Windows"],
    [UA.edgeWin, "Edge on Windows"], // not "Chrome": Edge also says Chrome/
    [UA.chromeAndroid, "Chrome on Android"], // not "Linux"
    [UA.safariIphone, "Safari on iOS"], // not "macOS"
  ])("names %s", (ua, expected) => {
    expect(describeBrowser(ua)).toBe(expected);
  });

  it("handles missing or unknown user agents", () => {
    expect(describeBrowser(null)).toBeNull();
    expect(describeBrowser("")).toBeNull();
    expect(describeBrowser("curl/8.7.1")).toBe("Unknown browser");
  });
});

describe("activityLabel", () => {
  it("labels known actions, adding safe details", () => {
    expect(activityLabel("auth.signin")).toBe("Signed in");
    expect(activityLabel("vault.master_password.changed")).toBe("Master password changed");
    expect(activityLabel("vault.item.delete")).toBe("Item deleted");
    expect(activityLabel("vault.item.create", { type: "API_KEY" })).toBe("Item created (API key)");
    expect(activityLabel("vault.export", { format: "csv" })).toBe(
      "Vault exported (unencrypted CSV)"
    );
  });

  it("falls back to the raw action for unknown ones", () => {
    expect(activityLabel("something.new")).toBe("something.new");
    expect(activityLabel("vault.item.create", { type: "UNKNOWN" })).toBe("Item created");
  });
});

describe("relativeTime", () => {
  const now = Date.UTC(2026, 10, 2, 12, 0, 0);
  it.each([
    [now - 10_000, "just now"],
    [now - 5 * 60_000, "5m ago"],
    [now - 3 * 3_600_000, "3h ago"],
    [now - 2 * 86_400_000, "2d ago"],
  ])("formats %s", (t, expected) => {
    expect(relativeTime(new Date(t).toISOString(), { now })).toBe(expected);
  });

  it("shows a date past 30 days, or months and years with longAgo: ago", () => {
    const at = (days: number) => new Date(now - days * 86_400_000).toISOString();
    expect(relativeTime(at(45), { now })).toBe(new Date(at(45)).toLocaleDateString());
    expect(relativeTime(at(95), { now, longAgo: "ago" })).toBe("3mo ago");
    expect(relativeTime(at(800), { now, longAgo: "ago" })).toBe("2y ago");
    expect(relativeTime(at(2), { now, longAgo: "ago" })).toBe("2d ago");
  });
});
