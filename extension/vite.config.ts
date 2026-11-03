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

const appOrigin = new URL(process.env.KEYCRYPT_APP_URL ?? "http://localhost:3000").origin;
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
        description: "Unlock your KeyCrypt vault locally and fill saved logins.",
        action: { default_popup: "popup.html", default_title: "KeyCrypt" },
        // activeTab + scripting: fill only the tab the user is on, after a click.
        permissions: ["activeTab", "scripting"],
        host_permissions: [`${appOrigin}/*`, ...extraHosts],
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
    rollupOptions: { input: { popup: "popup.html" } },
  },
});
