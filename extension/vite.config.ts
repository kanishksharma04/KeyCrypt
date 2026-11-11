import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import { buildManifest, type BrowserTarget } from "./src/manifest";

// Builds the Manifest V3 extension into dist/chrome or dist/firefox (load it
// unpacked from there); pnpm ext:package zips both for the stores.
//
//   KEYCRYPT_BROWSER   chrome (default) or firefox
//   KEYCRYPT_GECKO_ID  Firefox add-on id (default keycrypt-extension@keycrypt.app)
//
//   KEYCRYPT_APP_URL   origin of the KeyCrypt web app (default http://localhost:3000);
//                      becomes host_permissions so the popup can call its API
//                      with the session cookie.
//   KEYCRYPT_EXTRA_HOST_PERMISSIONS  comma-separated extra match patterns
//                      (tests only: lets the e2e test fill a page without a
//                      toolbar click).
//   KEYCRYPT_MANIFEST_KEY  optional public key, for a fixed extension id (tests).

const target: BrowserTarget = process.env.KEYCRYPT_BROWSER === "firefox" ? "firefox" : "chrome";
const { version } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8")
) as {
  version: string;
};
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
      const body = buildManifest({
        target,
        version,
        appHostPattern,
        extraHosts,
        manifestKey: process.env.KEYCRYPT_MANIFEST_KEY,
        geckoId: process.env.KEYCRYPT_GECKO_ID,
      });
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
    outDir: `dist/${target}`,
    emptyOutDir: true,
    target: target === "firefox" ? "firefox128" : "chrome120",
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
