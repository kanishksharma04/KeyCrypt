import { describe, expect, it } from "vitest";
import { buildManifest, DEFAULT_GECKO_ID, FIREFOX_MIN_VERSION, ICONS } from "./manifest";

const BASE = { version: "0.1.0", appHostPattern: "https://vault.example.com/*" };

describe("buildManifest", () => {
  it("Chromium: a background service worker, no Firefox settings", () => {
    const m = buildManifest({ ...BASE, target: "chrome" });
    expect(m.manifest_version).toBe(3);
    expect(m.background).toEqual({ service_worker: "background.js", type: "module" });
    expect(m).not.toHaveProperty("browser_specific_settings");
    expect(m).not.toHaveProperty("key");
  });

  it("Firefox: background scripts (event page) and a gecko id", () => {
    const m = buildManifest({ ...BASE, target: "firefox", manifestKey: "ignored-on-firefox" });
    expect(m.background).toEqual({ scripts: ["background.js"], type: "module" });
    expect(m.browser_specific_settings).toEqual({
      gecko: {
        id: DEFAULT_GECKO_ID,
        strict_min_version: FIREFOX_MIN_VERSION,
        data_collection_permissions: { required: ["authenticationInfo"] },
      },
    });
    expect(m).not.toHaveProperty("key");
    expect(
      (
        buildManifest({ ...BASE, target: "firefox", geckoId: "me@example.com" }) as {
          browser_specific_settings: { gecko: { id: string } };
        }
      ).browser_specific_settings.gecko.id
    ).toBe("me@example.com");
  });

  it.each(["chrome", "firefox"] as const)(
    "%s: the same minimal permissions and icons",
    (target) => {
      const m = buildManifest({ ...BASE, target });
      expect(m.permissions).toEqual(["activeTab", "scripting", "alarms", "cookies"]);
      expect(m.host_permissions).toEqual(["https://vault.example.com/*"]);
      expect(m.optional_host_permissions).toEqual(["https://*/*"]);
      expect(m).not.toHaveProperty("content_scripts"); // the save script is opt-in
      expect(m.icons).toEqual(ICONS);
      expect(Object.keys(ICONS)).toEqual(["16", "32", "48", "128"]);
      expect(JSON.stringify(m)).not.toContain('"storage"');
    }
  );

  it("test builds add the extra hosts and the save script on them", () => {
    const m = buildManifest({
      ...BASE,
      target: "chrome",
      extraHosts: ["http://127.0.0.1:4599/*"],
      manifestKey: "abc",
    });
    expect(m.host_permissions).toEqual(["https://vault.example.com/*", "http://127.0.0.1:4599/*"]);
    expect(m.content_scripts).toEqual([
      { matches: ["http://127.0.0.1:4599/*"], js: ["save.js"], run_at: "document_idle" },
    ]);
    expect(m.key).toBe("abc");
  });
});
