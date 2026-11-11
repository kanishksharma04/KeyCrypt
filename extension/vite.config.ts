import { defineConfig, type Plugin } from "vite";

// Builds the Manifest V3 extension into dist/ (load it unpacked from there).
//
//   KEYCRYPT_APP_URL   origin of the KeyCrypt web app (default http://localhost:3000);
//                      becomes host_permissions so the popup can call its API
//                      with the session cookie.
//   KEYCRYPT_EXTRA_HOST_PERMISSIONS  comma-separated extra match patterns
//                      (tests only: lets the e2e test fill a page without a
//                      toolbar click).
//   KEYCRYPT_MANIFEST_KEY  optional public key, for a fixed extension id (tests).

const appUrl = new URL(process.env.KEYCRYPT_APP_URL ?? "http://localhost:3000");
const appOrigin = appUrl.origin;
// Host permission for the app: scheme + host, no port. A pattern without a port
// matches any port, and chrome.cookies only reports changes to cookies whose
// (port-less) URL the extension has host permission for.
const appHostPattern = `${appUrl.protocol}//${appUrl.hostname}/*`;
const extraHosts = (process.env.KEYCRYPT_EXTRA_HOST_PERMISSIONS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function manifest(): Plugin {
  return {
    name: "keycrypt-manifest",
    generateBundle() {
      const body = {
        manifest_version: 3,
        name: "KeyCrypt",
        version: "0.1.0",
        description: "Unlock your KeyCrypt vault locally, fill logins and codes, save new logins.",
        action: { default_popup: "popup.html", default_title: "KeyCrypt" },
        // Holds the unlocked vault key in memory for a while (src/background.ts).
        background: { service_worker: "background.js", type: "module" },
        // activeTab + scripting: fill only the tab the user is on, after a click.
        // alarms: expire the unlocked key. cookies: drop it when the KeyCrypt
        // session cookie goes away (only the app origin is in host_permissions).
        permissions: ["activeTab", "scripting", "alarms", "cookies"],
        host_permissions: [appHostPattern, ...extraHosts],
        // Opt-in from the popup ("Offer to save new logins"): lets src/save.ts
        // notice submitted login forms. Not requested at install.
        optional_host_permissions: ["https://*/*"],
        // Test builds only: the save script on the local test page, which
        // Playwright can't grant through the permission prompt.
        ...(extraHosts.length > 0 && {
          content_scripts: [{ matches: extraHosts, js: ["save.js"], run_at: "document_idle" }],
        }),
        // Argon2id runs as WebAssembly (hash-wasm) in a worker.
        content_security_policy: {
          extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
        },
        ...(process.env.KEYCRYPT_MANIFEST_KEY && { key: process.env.KEYCRYPT_MANIFEST_KEY }),
      };
      this.emitFile({
        type: "asset",
        fileName: "manifest.json",
        source: JSON.stringify(body, null, 2),
      });
    },
  };
}

export default defineConfig({
  base: "./",
  define: { __KEYCRYPT_APP_URL__: JSON.stringify(appOrigin) },
  plugins: [manifest()],
  worker: { format: "es" },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "chrome120",
    modulePreload: false,
    rollupOptions: {
      input: { popup: "popup.html", background: "src/background.ts", save: "src/save.ts" },
      output: {
        // The manifest names these two files; the content script must stay a
        // single classic script (src/save.ts has no imports).
        entryFileNames: (chunk) =>
          chunk.name === "background" || chunk.name === "save"
            ? "[name].js"
            : "assets/[name]-[hash].js",
      },
    },
  },
});
