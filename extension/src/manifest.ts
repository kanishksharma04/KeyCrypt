// The extension's manifest for each browser (pure; unit-tested). Used by
// vite.config.ts at build time.
//
// Chromium: background service worker. Firefox (Manifest V3): background
// scripts (an event page) plus browser_specific_settings.gecko. Everything
// else is shared.

export type BrowserTarget = "chrome" | "firefox";

export interface ManifestOptions {
  target: BrowserTarget;
  version: string;
  /** Host permission for the KeyCrypt app, scheme + host without a port. */
  appHostPattern: string;
  /** Test builds only: extra hosts (and the save script on them). */
  extraHosts?: string[];
  /** Chromium test builds only: public key for a fixed extension id. */
  manifestKey?: string;
  /** Firefox: the add-on id (permanent once published on addons.mozilla.org). */
  geckoId?: string;
}

export const DEFAULT_GECKO_ID = "keycrypt-extension@keycrypt.app";
/** Firefox version with MV3 scripting, optional host permissions and module workers. */
export const FIREFOX_MIN_VERSION = "128.0";

export const ICONS = {
  "16": "icons/icon-16.png",
  "32": "icons/icon-32.png",
  "48": "icons/icon-48.png",
  "128": "icons/icon-128.png",
} as const;

export function buildManifest(options: ManifestOptions): Record<string, unknown> {
  const extraHosts = options.extraHosts ?? [];
  const firefox = options.target === "firefox";

  return {
    manifest_version: 3,
    name: "KeyCrypt",
    version: options.version,
    description: "Unlock your KeyCrypt vault locally, fill logins and codes, save new logins.",
    icons: ICONS,
    action: { default_popup: "popup.html", default_title: "KeyCrypt", default_icon: ICONS },
    // Holds the unlocked vault key in memory for a while (src/background.ts).
    background: firefox
      ? { scripts: ["background.js"], type: "module" }
      : { service_worker: "background.js", type: "module" },
    // activeTab + scripting: fill only the tab the user is on, after a click.
    // alarms: expire the unlocked key. cookies: drop it when the KeyCrypt
    // session cookie goes away (only the app's host is in host_permissions).
    permissions: ["activeTab", "scripting", "alarms", "cookies"],
    host_permissions: [options.appHostPattern, ...extraHosts],
    // Opt-in from the popup ("Offer to save new logins"): lets src/save.ts
    // notice submitted login forms. Not requested at install.
    optional_host_permissions: ["https://*/*"],
    // Test builds only: the save script on the local test page, which
    // Playwright can't grant through the permission prompt.
    ...(extraHosts.length > 0 && {
      content_scripts: [{ matches: extraHosts, js: ["save.js"], run_at: "document_idle" }],
    }),
    // Argon2id runs as WebAssembly (hash-wasm).
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
    ...(!firefox && options.manifestKey && { key: options.manifestKey }),
    ...(firefox && {
      browser_specific_settings: {
        gecko: {
          id: options.geckoId || DEFAULT_GECKO_ID,
          strict_min_version: FIREFOX_MIN_VERSION,
          // Saved logins are sent (encrypted) to the user's KeyCrypt server.
          data_collection_permissions: { required: ["authenticationInfo"] },
        },
      },
    }),
  };
}
